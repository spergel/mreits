#!/usr/bin/env python3
"""
Extract preferred liquidation preference from XBRL instance XML.

Why: SEC companyfacts feed is often missing certain concepts/timelines for
preferred stock liquidation preference (even though the filed balance sheet
clearly shows it).

This script downloads 10-Q / 10-K filings via SEC EDGAR index pages, finds
instance XML documents, parses contexts, and sums all
us-gaap:PreferredStockLiquidationPreferenceValue facts per context period end.

Output (web/data/preferred_liq.csv):
  ticker,period,preferred_liquidation_preference
"""

import csv
import os
import sys
from typing import Dict, List, Optional, Tuple

from bs4 import BeautifulSoup

# Allow importing sec_api_client from repo root
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)

from sec_api_client import SECAPIClient, _sec_get  # noqa: E402

UA_CONTACT = "mreit-site contact@example.com"
IN_MASTER_CSV = os.path.join(ROOT, "web", "data", "mreit_master.csv")
OUT_CSV = os.path.join(ROOT, "web", "data", "preferred_liq.csv")
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
    """
    XBRL context period can be duration (<startDate>/<endDate>) or instant (<instant/>).
    We return the period end date as YYYY-MM-DD (string).
    """
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


def extract_preferred_liq_from_instance(xml_bytes: bytes) -> Dict[str, float]:
    """
    Parse an XBRL instance XML and return {period_end: summed_preferred_liq}.
    """
    soup = BeautifulSoup(xml_bytes, "xml")
    ctx_map = build_context_map(soup)

    # Prefer PreferredStockLiquidationPreferenceValue because it matches the
    # "aggregate liquidation preference" shown on balance sheets.
    concept_suffixes = [
        "PreferredStockLiquidationPreferenceValue",
    ]

    out: Dict[str, float] = {}
    for el in soup.find_all():
        name = el.name or ""
        if not any(name.endswith(s) for s in concept_suffixes):
            continue
        ctx_ref = el.get("contextRef", "")
        if not ctx_ref:
            continue
        period = ctx_map.get(ctx_ref)
        if not period:
            continue
        v = parse_num(el.get_text(strip=True))
        if v is None:
            continue
        out[period] = out.get(period, 0.0) + v
    return out


def pick_instance_xml_documents(docs) -> List:
    # In practice for these filings, instance XML docs have .xml filenames.
    return [d for d in docs if d.filename.lower().endswith(".xml")]


def main() -> None:
    # Load tickers from the same master used elsewhere.
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

    years_back = int(os.environ.get("YEARS_BACK", "5"))
    forms = [x.strip().upper() for x in os.environ.get("FORMS", "10-Q,10-K").split(",") if x.strip()]
    only = os.environ.get("TICKERS", "").strip()
    wanted = {t.strip().upper() for t in only.split(",") if t.strip()} if only else None

    client = SECAPIClient(
        data_dir=DATA_DIR,
        user_agent=UA_CONTACT,
        rate_limit_delay=0.25,
        company_tickers_path=COMPANY_TICKERS_PATH,
    )

    # Merge strategy: don't wipe existing preferred_liq rows when this script
    # runs for a subset of tickers.
    existing: Dict[Tuple[str, str], float] = {}
    if os.path.exists(OUT_CSV):
        try:
            with open(OUT_CSV, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    t = (row.get("ticker") or "").strip().upper()
                    period = (row.get("period") or "").strip()
                    v = parse_num(row.get("preferred_liquidation_preference") or "")
                    if not t or not period or v is None:
                        continue
                    existing[(t, period)] = v
        except Exception:
            # If we can't read/parse, fall back to overwriting with extracted rows.
            existing = {}

    rows: List[Tuple[str, str, float]] = []
    for ticker in tickers:
        if wanted is not None and ticker not in wanted:
            continue
        print(f"[{ticker}] fetching preferred liquidation preference from filings...")
        # Fetch both 10-Q and 10-K to cover all quarterly BVPS periods.
        filings: List[Dict] = []
        if "10-Q" in forms or "10-Q/A" in forms:
            filings.extend(client.get_historical_10q_filings(ticker, years_back=years_back))
        if "10-K" in forms or "10-K/A" in forms:
            filings.extend(client.get_historical_10k_filings(ticker, years_back=years_back))

        if not filings:
            continue

        # De-dup by (index_url) so we don't process the same filing multiple times.
        dedup = {}
        for f in filings:
            ix = f.get("index_url")
            if not ix:
                continue
            dedup[ix] = f
        filings = list(dedup.values())

        best_for_period: Dict[str, float] = {}
        for filing in filings:
            index_url = filing.get("index_url")
            if not index_url:
                continue

            docs = client.get_documents_from_index(index_url)
            xml_docs = pick_instance_xml_documents(docs)
            if not xml_docs:
                continue

            # Try each instance XML until we find at least one preferred liquidation fact.
            extracted_any = False
            for d in xml_docs:
                try:
                    resp = _sec_get(d.url, headers=client.headers)
                    data = resp.content
                    per_map = extract_preferred_liq_from_instance(data)
                    if not per_map:
                        continue
                    extracted_any = True
                    # Merge into best_for_period by max value (preferred amounts
                    # should be stable; max avoids accidental double counting if
                    # multiple instance-like docs expose overlapping concepts).
                    for period, val in per_map.items():
                        prev = best_for_period.get(period)
                        if prev is None or val > prev:
                            best_for_period[period] = val
                    break
                except Exception:
                    continue

            if extracted_any and len(best_for_period) > 0:
                # We already got what we needed from this filing; move on.
                continue

        for period, val in best_for_period.items():
            rows.append((ticker, period, val))

    # Merge extracted rows into existing (max preferred value wins).
    merged: Dict[Tuple[str, str], float] = dict(existing)
    for t, period, val in rows:
        k = (t, period)
        prev = merged.get(k)
        if prev is None or val > prev:
            merged[k] = val

    os.makedirs(os.path.dirname(OUT_CSV), exist_ok=True)
    with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f, fieldnames=["ticker", "period", "preferred_liquidation_preference"]
        )
        writer.writeheader()
        for (t, period) in sorted(merged.keys(), key=lambda x: (x[0], x[1])):
            writer.writerow(
                {
                    "ticker": t,
                    "period": period,
                    "preferred_liquidation_preference": merged[(t, period)],
                }
            )

    print(
        f"Merged {len(rows)} extracted rows into existing; total {len(merged)} -> {OUT_CSV}"
    )


if __name__ == "__main__":
    main()

