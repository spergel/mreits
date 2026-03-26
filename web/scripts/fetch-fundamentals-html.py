#!/usr/bin/env python3
"""
Extract fallback fundamentals from 10-Q HTML tables when XBRL concepts are sparse.

Outputs: web/data/fundamentals_html.csv
Columns: ticker,period,leverage,financing_rate,net_interest_margin,swap_notional,unrestricted_cash
"""

import csv
import os
import re
import sys
from datetime import datetime
from typing import Dict, List, Optional

from bs4 import BeautifulSoup

UA = "mreit-site contact@example.com"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_CSV = os.path.join(ROOT, "web", "data", "fundamentals_html.csv")
MASTER_CSV = os.path.join(ROOT, "web", "data", "mreit_master.csv")

sys.path.insert(0, ROOT)
from sec_api_client import SECAPIClient, _is_main_filing_document, _sec_get


def parse_tickers(path: str) -> List[str]:
    tickers = []
    seen = set()
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            t = (row.get("ticker") or "").strip().upper()
            if t and t not in seen:
                seen.add(t)
                tickers.append(t)
    return tickers


def parse_num(text: str) -> Optional[float]:
    t = text.strip().replace(",", "")
    if not t:
        return None
    m = re.search(r"\(?-?\$?\s*(\d+(?:\.\d+)?)\)?", t)
    if not m:
        return None
    v = float(m.group(1))
    if "(" in t and ")" in t:
        v = -v
    return v


def parse_pct(text: str) -> Optional[float]:
    m = re.search(r"(-?\d+(?:\.\d+)?)\s*%", text)
    return float(m.group(1)) if m else None


def parse_multiple(text: str) -> Optional[float]:
    m = re.search(r"(-?\d+(?:\.\d+)?)\s*x\b", text, re.IGNORECASE)
    return float(m.group(1)) if m else None


def parse_ratio_to_one(text: str) -> Optional[float]:
    m = re.search(r"(-?\d+(?:\.\d+)?)\s*[:x]\s*1(?:\.0)?\b", text, re.IGNORECASE)
    return float(m.group(1)) if m else None


def parse_all_ratios_to_one(text: str) -> List[float]:
    vals = []
    for m in re.finditer(r"(-?\d+(?:\.\d+)?)\s*[:x]\s*1(?:\.0)?\b", text, re.IGNORECASE):
        vals.append(float(m.group(1)))
    return vals


def best_row_amount(cells: List[str]) -> Optional[float]:
    # Prefer data cells over the label cell; pick the largest absolute amount.
    # Cash-flow tables often show one value per period plus tiny footnote numbers.
    candidates: List[float] = []
    for c in cells[1:] if len(cells) > 1 else cells:
        v = parse_num(c)
        if v is None:
            continue
        if abs(v) <= 1:
            continue
        candidates.append(v)
    if not candidates:
        return None
    return max(candidates, key=lambda x: abs(x))


def first_percent_from_row(row_text: str) -> Optional[float]:
    # Handles rows like "0.97 | %", "(0.26 | %)", and "5.4 %"
    m = re.search(r"\(?\s*(-?\d+(?:\.\d+)?)\s*\)?\s*(?:\|\s*)?%", row_text)
    return float(m.group(1)) if m else None


def first_matching_metric(cells: List[str], metric: str) -> Optional[float]:
    joined = " | ".join(cells).lower()
    if metric == "leverage":
        if "leverage" not in joined and "debt-to-equity" not in joined and "debt to equity" not in joined:
            return None
        # "Economic debt-to-equity ratio" rows often omit the word "leverage" — allow them.
        if not re.search(
            r"economic leverage|gaap leverage|net leverage|leverage ratio|"
            r"\bleverage\b|economic debt|debt-to-equity|debt to equity",
            joined,
        ):
            return None
        for c in cells:
            v = parse_multiple(c)
            if v is None:
                v = parse_ratio_to_one(c)
            if v is not None:
                return v
        v = parse_ratio_to_one(joined)
        if v is not None:
            return v
        if re.search(r"debt[\s-]*to[\s-]*equity|leverage\s+multiple", joined):
            # Prefer numeric values from data cells (skip header/label cell with footnotes).
            for c in cells[1:]:
                m = re.search(r"\b(\d+(?:\.\d+)?)\b", c)
                if not m:
                    continue
                val = float(m.group(1))
                if 2 <= val <= 25:
                    return val
    elif metric == "financing_rate":
        if "financing rate" not in joined and "cost of funds" not in joined:
            return None
        v = first_percent_from_row(joined)
        if v is not None:
            return v
        for c in cells:
            v = parse_pct(c)
            if v is not None:
                return v
    elif metric == "net_interest_margin":
        if (
            "net interest margin" not in joined
            and "net interest rate margin" not in joined
            and "effective interest rate margin" not in joined
            and "net interest spread" not in joined
            and "net interest income/spread" not in joined
            and "net spread" not in joined
            and "interest margin" not in joined
            and "net interest income/net interest spread" not in joined
        ):
            return None
        if "net interest income/spread" in joined:
            # TWO-style: row has dollar columns first; take the first typical NIM % (-5..15).
            for c in cells[1:]:
                v = parse_pct(c)
                if v is not None and -5 <= v <= 15:
                    return v
        v = first_percent_from_row(joined)
        if v is not None:
            return v
        for c in cells:
            v = parse_pct(c)
            if v is not None:
                return v
    elif metric == "swap_notional":
        if "swap" not in joined or "notional" not in joined:
            return None
        for c in cells:
            v = parse_num(c)
            # Notional is positive; small negatives come from "(1)" footnotes matching parse_num.
            if v is not None and v > 0:
                return v
    return None


def extract_mitt_total_investment_portfolio_nim(soup: BeautifulSoup) -> Optional[float]:
    """
    MITT: 'Total Investment Portfolio' row ends with net interest margin % then leverage (e.g. 0.73 % … 1.7x).
    """
    for tr in soup.find_all("tr"):
        cells = [c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])]
        if not cells or not cells[0].strip():
            continue
        if cells[0].strip().lower() != "total investment portfolio":
            continue
        joined = " | ".join(cells)
        m = re.search(r"([\d.]+)\s*\|\s*%\s*\|\s*\|\s*([\d.]+)\s*x", joined)
        if m:
            return float(m.group(1))
        m = re.search(r"\(?([\d.]+)\)?\s*\|\s*%\s*\|\s*\|\s*([\d.]+)\s*x", joined)
        if m:
            return float(m.group(1))
    return None


def extract_repo_leverage_from_balance_sheet(soup: BeautifulSoup) -> Optional[float]:
    """
    When GAAP omits DebtToEquityRatio, use repo financing / total stockholders' equity (mREIT convention).
    Matches condensed consolidated balance sheet rows in 10-Q HTML.
    """
    repo_val: Optional[float] = None
    equity_val: Optional[float] = None
    for tr in soup.find_all("tr"):
        cells = [c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])]
        if not cells:
            continue
        joined = " | ".join(cells).lower()
        if repo_val is None and "securities sold under agreements to repurchase" in joined:
            best: Optional[float] = None
            for c in cells:
                v = parse_num(c)
                if v is not None and v > 1e6:
                    if best is None or v > best:
                        best = v
            if best is not None:
                repo_val = best
        if equity_val is None and re.search(
            r"total\s+stockholders['\"]?\s+equity(?!\s+and)",
            joined,
        ):
            if "noncontrolling" in joined or "non-controlling" in joined:
                continue
            for c in reversed(cells):
                v = parse_num(c)
                if v is not None and v > 1e5:
                    equity_val = v
                    break
    if repo_val is not None and equity_val is not None and equity_val > 0:
        return repo_val / equity_val
    return None


def period_to_label(period: str) -> str:
    try:
        d = datetime.strptime(period, "%Y-%m-%d")
        return d.strftime("%B %-d, %Y")
    except Exception:
        try:
            d = datetime.strptime(period, "%Y-%m-%d")
            # Windows fallback for day formatting
            return d.strftime("%B %#d, %Y")
        except Exception:
            return period


def extract_metrics_from_html(html: bytes, period: str) -> Dict[str, Optional[float]]:
    soup = BeautifulSoup(html, "html.parser")
    metrics: Dict[str, Optional[float]] = {
        "leverage": None,
        "financing_rate": None,
        "net_interest_margin": None,
        "swap_notional": None,
        "unrestricted_cash": None,
        "common_pref_equity_ratio": None,
        "buybacks": None,
        "issuance": None,
        "preferred_issuance": None,
        "common_equity": None,
        "preferred_equity": None,
        "total_liabilities": None,
    }

    target_period_label = period_to_label(period)

    for table in soup.find_all("table"):
        table_rows: List[List[str]] = []
        for tr in table.find_all("tr"):
            cells = [c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])]
            if not cells:
                continue
            table_rows.append(cells)
            for k in ("leverage", "financing_rate", "net_interest_margin", "swap_notional"):
                if metrics[k] is None:
                    metrics[k] = first_matching_metric(cells, k)

            row_text = " | ".join(cells).lower()
            if metrics["buybacks"] is None and re.search(
                r"payments?\s+for\s+repurchase|repurchases?\s+of\s+common\s+stock|buybacks?|treasury\s+stock\s+purchased",
                row_text,
            ):
                metrics["buybacks"] = best_row_amount(cells)
            if metrics["issuance"] is None and re.search(
                r"proceeds?\s+from\s+issuance\s+of\s+common\s+stock|issuance\s+of\s+common\s+stock|proceeds?\s+from\s+issuance",
                row_text,
            ):
                if "preferred" not in row_text and "preference" not in row_text:
                    metrics["issuance"] = best_row_amount(cells)
            if metrics["preferred_issuance"] is None and re.search(
                r"proceeds?\s+from\s+issuance\s+of\s+(preferred|preference)\s+stock|issuance\s+of\s+(preferred|preference)\s+stock",
                row_text,
            ):
                metrics["preferred_issuance"] = best_row_amount(cells)

        # TWO-style leverage table:
        # header includes "Economic Debt-to-Equity Ratio", rows include period labels and multiple X:1.0 values.
        if metrics["leverage"] is None:
            for i, cells in enumerate(table_rows):
                header = " | ".join(cells).lower()
                if "economic debt-to-equity ratio" not in header:
                    continue
                for data_row in table_rows[i + 1:i + 12]:
                    if not data_row:
                        continue
                    row0 = data_row[0]
                    if target_period_label not in row0 and period not in row0:
                        continue
                    ratios = parse_all_ratios_to_one(" | ".join(data_row))
                    if ratios:
                        # In these rows, last ratio is the economic debt-to-equity ratio.
                        metrics["leverage"] = ratios[-1]
                        break
                if metrics["leverage"] is not None:
                    break

    # Cash often appears outside dense metric tables.
    text = soup.get_text(" ", strip=True)
    cash_patterns = [
        r"cash and cash equivalents[^$]{0,80}\$\s*([\d,]+(?:\.\d+)?)",
        r"cash and cash equivalents[^0-9]{0,80}([\d,]+(?:\.\d+)?)",
    ]
    for pat in cash_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            metrics["unrestricted_cash"] = float(m.group(1).replace(",", ""))
            break

    if metrics["leverage"] is None:
        metrics["leverage"] = extract_repo_leverage_from_balance_sheet(soup)

    if metrics["net_interest_margin"] is None:
        metrics["net_interest_margin"] = extract_mitt_total_investment_portfolio_nim(soup)

    return metrics


def main() -> None:
    tickers = parse_tickers(MASTER_CSV)
    only = os.environ.get("TICKERS")
    wanted: Optional[set] = None
    if only:
        wanted = {t.strip().upper() for t in only.split(",") if t.strip()}
        tickers = [t for t in tickers if t in wanted]
    years_back = int(os.environ.get("YEARS_BACK", "5"))
    forms_env = os.environ.get("FORMS", "10-Q,10-K")
    forms = [f.strip().upper() for f in forms_env.split(",") if f.strip()]
    if not forms:
        forms = ["10-Q", "10-K"]
    client = SECAPIClient(
        data_dir=os.path.join(ROOT, "data"),
        user_agent=UA,
        rate_limit_delay=0.5,
        company_tickers_path=os.path.join(ROOT, "data", "company_tickers.json"),
    )

    kept_rows: List[Dict[str, object]] = []
    if wanted and os.path.isfile(OUT_CSV):
        with open(OUT_CSV, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                t = (r.get("ticker") or "").strip().upper()
                if t not in wanted:
                    kept_rows.append(dict(r))

    rows: List[Dict[str, object]] = []
    for ticker in tickers:
        print(f"[{ticker}] fetching filings...", flush=True)
        filings: List[Dict[str, object]] = []
        if "10-Q" in forms:
            filings.extend(client.get_historical_10q_filings(ticker, years_back=years_back))
        if "10-K" in forms:
            filings.extend(client.get_historical_10k_filings(ticker, years_back=years_back))
        # Deduplicate by period+form, preferring latest filing date.
        dedup: Dict[tuple, Dict[str, object]] = {}
        for f in filings:
            period = f.get("period_end_date") or f.get("date") or ""
            form = (f.get("form") or "").upper()
            if not period or form not in ("10-Q", "10-K"):
                continue
            key = (period, form)
            prev = dedup.get(key)
            if not prev or (f.get("date") or "") > (prev.get("date") or ""):
                dedup[key] = f
        filings = list(dedup.values())
        filings.sort(key=lambda f: f.get("period_end_date") or f.get("date") or "")
        print(f"[{ticker}] {len(filings)} filings in range", flush=True)

        for filing in filings:
            period = filing.get("period_end_date") or filing.get("date") or ""
            if not period:
                continue
            filing_form = (filing.get("form") or "10-Q").upper()
            docs = client.get_documents_from_index(filing["index_url"])
            main_doc = None
            for d in docs:
                fn = d.filename.lower()
                if fn.endswith((".htm", ".html")) and _is_main_filing_document(d, filing_form):
                    main_doc = d
                    break
            if not main_doc:
                continue
            try:
                resp = _sec_get(main_doc.url, headers=client.headers)
                resp.raise_for_status()
                m = extract_metrics_from_html(resp.content, period)
                rows.append(
                    {
                        "ticker": ticker,
                        "period": period,
                        "leverage": m["leverage"],
                        "financing_rate": m["financing_rate"],
                        "net_interest_margin": m["net_interest_margin"],
                        "swap_notional": m["swap_notional"],
                        "unrestricted_cash": m["unrestricted_cash"],
                        "common_pref_equity_ratio": None,
                        "buybacks": m["buybacks"],
                        "issuance": m["issuance"],
                        "preferred_issuance": m["preferred_issuance"],
                        "common_equity": m["common_equity"],
                        "preferred_equity": m["preferred_equity"],
                        "total_liabilities": m["total_liabilities"],
                    }
                )
                print(f"[{ticker}] {period} extracted", flush=True)
            except Exception:
                continue

    rows = kept_rows + rows
    rows.sort(key=lambda r: ((r.get("ticker") or ""), (r.get("period") or "")))

    os.makedirs(os.path.dirname(OUT_CSV), exist_ok=True)
    with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "ticker",
                "period",
                "leverage",
                "financing_rate",
                "net_interest_margin",
                "swap_notional",
                "unrestricted_cash",
                "common_pref_equity_ratio",
                "buybacks",
                "issuance",
                "preferred_issuance",
                "common_equity",
                "preferred_equity",
                "total_liabilities",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)

    print(f"wrote {len(rows)} rows -> {OUT_CSV}")


if __name__ == "__main__":
    main()

