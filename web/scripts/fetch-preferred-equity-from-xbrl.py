#!/usr/bin/env python3
"""
Extract preferred equity (par/carrying preferred stock value) from XBRL
instance XML and compute:
  - preferred_equity
  - common_equity = stockholders_equity - preferred_equity
  - common_pref_equity_ratio = common_equity / preferred_equity

Why:
SEC companyfacts can be sparse or omit preferred equity concepts for some
tickers/periods, which leaves `preferredEquity`/`commonEquity` null in the app.

This script downloads 10-Q / 10-K filings, finds the instance XML, then:
  - sums preferred stock values by context period end (preferred stock series)
  - picks stockholders equity total by context period end

Output: web/data/preferred_equity_xbrl.csv
Columns:
  ticker,period,preferred_equity,common_equity,common_pref_equity_ratio
"""

import csv
import os
import sys
from typing import Dict, List, Optional, Tuple

from bs4 import BeautifulSoup

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)

from sec_api_client import SECAPIClient, _sec_get  # noqa: E402

UA_CONTACT = "mreit-site contact@example.com"
IN_MASTER_CSV = os.path.join(ROOT, "web", "data", "mreit_master.csv")
OUT_CSV = os.path.join(ROOT, "web", "data", "preferred_equity_xbrl.csv")
DATA_DIR = os.path.join(ROOT, "web", "data")
COMPANY_TICKERS_PATH = os.path.join(DATA_DIR, "company_tickers.json")


def parse_num(s: str) -> Optional[float]:
    t = (s or "").strip().replace(",", "")
    if not t:
        return None
    try:
        return float(t)
    except ValueError:
        return None


def period_end_from_context(ctx_tag) -> Optional[str]:
    if ctx_tag is None:
        return None
    period = ctx_tag.find(["period", "xbrli:period"])
    if not period:
        return None
    instant = period.find("instant")
    if instant and instant.get_text(strip=True):
        return instant.get_text(strip=True)
    end_date = period.find("endDate")
    if end_date and end_date.get_text(strip=True):
        return end_date.get_text(strip=True)
    return None


def build_context_map(soup: BeautifulSoup) -> Dict[str, Optional[str]]:
    ctx_tags = soup.find_all(["context", "xbrli:context"])
    out: Dict[str, Optional[str]] = {}
    for ctx in ctx_tags:
        cid = ctx.get("id")
        if not cid:
            continue
        out[cid] = period_end_from_context(ctx)
    return out


def extract_equity_split_from_instance(xml_bytes: bytes) -> Dict[str, Dict[str, float]]:
    """
    Return by-period:
      { period_end: { preferred_equity, common_equity, common_pref_equity_ratio, ... } }
    """
    soup = BeautifulSoup(xml_bytes, "xml")
    ctx_map = build_context_map(soup)

    # Preferred stock value concept families. We'll prefer PreferredStockValue
    # if present; else fall back to PreferredStockValueOutstanding; else carrying.
    preferred_par_suffixes = ["PreferredStockValue"]
    preferred_outstanding_suffixes = ["PreferredStockValueOutstanding"]
    preferred_carry_suffixes = [
        "RedeemablePreferredStockCarryingAmount",
        "TemporaryEquityCarryingAmount",
    ]

    # Stockholders equity candidates. Prefer including-NCI if present.
    equity_suffix_priority = [
        "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
        "StockholdersEquityAttributableToParent",
        "StockholdersEquity",
    ]

    preferred_par_sum: Dict[str, float] = {}
    preferred_par_present: Dict[str, bool] = {}

    preferred_out_sum: Dict[str, float] = {}
    preferred_out_present: Dict[str, bool] = {}

    preferred_carry_sum: Dict[str, float] = {}
    preferred_carry_present: Dict[str, bool] = {}

    equity_candidates: Dict[str, Dict[str, float]] = {}
    equity_present: Dict[str, Dict[str, bool]] = {}

    concept_to_category: List[Tuple[str, str]] = []
    for sfx in preferred_par_suffixes:
        concept_to_category.append((sfx, "preferred_par"))
    for sfx in preferred_outstanding_suffixes:
        concept_to_category.append((sfx, "preferred_out"))
    for sfx in preferred_carry_suffixes:
        concept_to_category.append((sfx, "preferred_carry"))

    equity_suffixes = set(equity_suffix_priority)

    for el in soup.find_all():
        name = el.name or ""
        if not name:
            continue

        ctx_ref = el.get("contextRef", "")
        if not ctx_ref:
            continue
        period = ctx_map.get(ctx_ref)
        if not period:
            continue

        val = parse_num(el.get_text(strip=True))
        if val is None:
            continue

        # Preferred categories
        matched_category = None
        for sfx, cat in concept_to_category:
            if name.endswith(sfx):
                matched_category = cat
                break
        if matched_category:
            if matched_category == "preferred_par":
                preferred_par_sum[period] = preferred_par_sum.get(period, 0.0) + val
                preferred_par_present[period] = True
            elif matched_category == "preferred_out":
                preferred_out_sum[period] = preferred_out_sum.get(period, 0.0) + val
                preferred_out_present[period] = True
            elif matched_category == "preferred_carry":
                preferred_carry_sum[period] = preferred_carry_sum.get(period, 0.0) + val
                preferred_carry_present[period] = True
            continue

        # Equity categories
        for eq_sfx in equity_suffix_priority:
            if name.endswith(eq_sfx):
                equity_present.setdefault(period, {})[eq_sfx] = True
                # Keep the max per concept per period (to reduce duplicate facts risk).
                equity_candidates.setdefault(period, {})
                prev = equity_candidates[period].get(eq_sfx)
                if prev is None or val > prev:
                    equity_candidates[period][eq_sfx] = val
                break

    out: Dict[str, Dict[str, float]] = {}
    # Merge all periods we encountered
    periods = set()
    periods.update(equity_candidates.keys())
    periods.update(preferred_par_sum.keys())
    periods.update(preferred_out_sum.keys())
    periods.update(preferred_carry_sum.keys())

    for period in periods:
        # Pick stockholders equity in priority order.
        total_equity = None
        for eq_sfx in equity_suffix_priority:
            if equity_candidates.get(period, {}).get(eq_sfx) is not None:
                total_equity = equity_candidates[period][eq_sfx]
                break
        if total_equity is None:
            continue

        preferred_equity = None
        # Prefer PreferredStockValue facts if present at all for this period.
        if preferred_par_present.get(period):
            preferred_equity = preferred_par_sum.get(period, 0.0)
        elif preferred_out_present.get(period):
            preferred_equity = preferred_out_sum.get(period, 0.0)
        elif preferred_carry_present.get(period):
            preferred_equity = preferred_carry_sum.get(period, 0.0)
        else:
            # If the instance contains no preferred-like facts for the period,
            # treat preferred equity as zero (common equity = total equity).
            preferred_equity = 0.0

        common_equity = total_equity - preferred_equity
        ratio = common_equity / preferred_equity if preferred_equity and preferred_equity != 0 else None

        out[period] = {
            "preferred_equity": preferred_equity,
            "common_equity": common_equity,
            "common_pref_equity_ratio": ratio if ratio is not None else float("nan"),
        }

    return out


def pick_instance_xml_documents(docs) -> List:
    # Instance XML docs usually end with .xml.
    return [d for d in docs if d.filename.lower().endswith(".xml")]


def main() -> None:
    tickers: List[str] = []
    seen = set()
    with open(IN_MASTER_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            t = (row.get("ticker") or "").strip().upper()
            if not t or t in seen:
                continue
            seen.add(t)
            tickers.append(t)

    only = os.environ.get("TICKERS", "").strip()
    wanted = {t.strip().upper() for t in only.split(",") if t.strip()} if only else None

    # If TICKERS isn't provided, only extract for tickers where companyfacts
    # didn't populate preferred_equity in our generated fundamentals.csv.
    if wanted is None:
        wanted = set()
        fp = os.path.join(DATA_DIR, "fundamentals.csv")
        if os.path.exists(fp):
            # Skip the initial comment header line ("# Selected ...").
            with open(fp, "r", encoding="utf-8") as f:
                non_comment_lines = [l for l in f.read().splitlines() if not l.strip().startswith("#")]

            if non_comment_lines:
                reader = csv.DictReader(non_comment_lines)
                for row in reader:
                    t = (row.get("ticker") or "").strip().upper()
                    if not t:
                        continue
                    # preferred_equity is blank/null for missing preferred data.
                    # Treat empty string and "NaN"/"nan" as missing.
                    pe_raw = (row.get("preferred_equity") or "").strip()
                    pe_norm = pe_raw.lower()
                    if pe_raw == "" or pe_norm == "nan":
                        wanted.add(t)
        if len(wanted) == 0:
            wanted = None  # fallback: process all tickers if we couldn't detect

    years_back = int(os.environ.get("YEARS_BACK", "5"))
    forms = [x.strip().upper() for x in os.environ.get("FORMS", "10-Q,10-K").split(",") if x.strip()]

    client = SECAPIClient(
        data_dir=DATA_DIR,
        user_agent=UA_CONTACT,
        rate_limit_delay=0.25,
        company_tickers_path=COMPANY_TICKERS_PATH,
    )

    rows: List[Tuple[str, str, float, float, Optional[float]]] = []
    for ticker in tickers:
        if wanted is not None and ticker not in wanted:
            continue
        print(f"[{ticker}] extracting preferred equity from XBRL instances...")

        filings: List[Dict] = []
        if "10-Q" in forms or "10-Q/A" in forms:
            filings.extend(client.get_historical_10q_filings(ticker, years_back=years_back))
        if "10-K" in forms or "10-K/A" in forms:
            filings.extend(client.get_historical_10k_filings(ticker, years_back=years_back))
        if not filings:
            continue

        dedup = {}
        for f in filings:
            ix = f.get("index_url")
            if not ix:
                continue
            dedup[ix] = f
        filings = list(dedup.values())

        best: Dict[str, Dict[str, float]] = {}
        for filing in filings:
            index_url = filing.get("index_url")
            if not index_url:
                continue
            docs = client.get_documents_from_index(index_url)
            xml_docs = pick_instance_xml_documents(docs)
            if not xml_docs:
                continue

            extracted_any = False
            for d in xml_docs[:3]:
                try:
                    resp = _sec_get(d.url, headers=client.headers)
                    per_map = extract_equity_split_from_instance(resp.content)
                    if not per_map:
                        continue
                    extracted_any = True
                    for period, vals in per_map.items():
                        prev = best.get(period)
                        # Choose the preferred equity variant that yields the largest total
                        # across series (usually the most complete extraction).
                        if prev is None or vals["preferred_equity"] > prev["preferred_equity"]:
                            best[period] = vals
                    break
                except Exception:
                    continue
            if extracted_any and len(best) > 0:
                # Keep going because later filings might contain additional periods.
                continue

        for period, vals in best.items():
            pref = vals["preferred_equity"]
            common = vals["common_equity"]
            ratio = vals.get("common_pref_equity_ratio")
            if ratio is not None and (ratio != ratio):  # nan check
                ratio = None
            rows.append((ticker, period, pref, common, ratio))

    os.makedirs(os.path.dirname(OUT_CSV), exist_ok=True)
    with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "ticker",
                "period",
                "preferred_equity",
                "common_equity",
                "common_pref_equity_ratio",
            ],
        )
        writer.writeheader()
        for t, period, pref, common, ratio in rows:
            writer.writerow(
                {
                    "ticker": t,
                    "period": period,
                    "preferred_equity": pref,
                    "common_equity": common,
                    "common_pref_equity_ratio": "" if ratio is None else ratio,
                }
            )

    print(f"Wrote {len(rows)} preferred equity rows -> {OUT_CSV}")


if __name__ == "__main__":
    main()

