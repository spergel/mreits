#!/usr/bin/env python3
"""
mREIT Coupon Allocation Extractor

Fetches 10-Q / 10-K filings for mortgage REITs from SEC EDGAR and extracts
coupon allocation data — the distribution of MBS/loan holdings across coupon
rate buckets (e.g. <=2%, 2-3%, 3-4%, 4-5%, 5-6%, 6%+).

Usage:
    python mreit_coupon_extractor.py                     # all tickers in MREIT_TICKERS
    python mreit_coupon_extractor.py AGNC NLY            # specific tickers
    python mreit_coupon_extractor.py --filing 10-K AGNC  # use 10-K instead of 10-Q
    python mreit_coupon_extractor.py --output output.csv # write CSV
"""

import argparse
import csv
import io
import json
import logging
import os
import re
import sys
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

# Ensure stdout can handle unicode on Windows
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf-16"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from bs4 import BeautifulSoup, Tag

from sec_api_client import SECAPIClient, _sec_get

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Known mREITs
# ---------------------------------------------------------------------------
MREIT_TICKERS = [
    # Agency / residential mREITs
    "AGNC",   # AGNC Investment Corp
    "NLY",    # Annaly Capital Management
    "ARR",    # ARMOUR Residential REIT
    "DX",     # Dynex Capital
    "TWO",    # Two Harbors Investment
    "IVR",    # Invesco Mortgage Capital
    "ORC",    # Orchid Island Capital
    "CIM",    # Chimera Investment Corporation
    "MFA",    # MFA Financial
    "MITT",   # AG Mortgage Investment Trust (TPG Mortgage)
    # "EARN",  # Ellington Credit Co (fka Ellington Residential) — no coupon tables; last SEC filing Sept 2024
    "CHMI",   # Cherry Hill Mortgage Investment
    "AOMR",   # Angel Oak Mortgage (non-QM residential)
    # Hybrid / diversified mREITs
    "RITM",   # Rithm Capital
    "EFC",    # Ellington Financial
    "PMT",    # PennyMac Mortgage Trust
    "RWT",    # Redwood Trust
    "ADAM",   # Adamas Trust (formerly New York Mortgage Trust / NYMT, rebranded Sep 2025)
    "RPT",    # Rithm Property Trust
    # Commercial mREITs
    "STWD",   # Starwood Property Trust
    "BXMT",   # Blackstone Mortgage Trust
    "ABR",    # Arbor Realty Trust
    "ARI",    # Apollo Commercial Real Estate Finance
    "LADR",   # Ladder Capital Corp
    "RC",     # Ready Capital Corporation
    "TRTX",   # TPG RE Finance Trust
    "KREF",   # KKR Real Estate Finance Trust
    "CMTG",   # Claros Mortgage Trust
    "ACRE",   # Ares Commercial Real Estate
    "FBRT",   # Franklin BSP Realty Trust
    "GPMT",   # Granite Point Mortgage Trust
    "LFT",    # Lument Finance Trust
    "ACR",    # ACRES Commercial Realty
    "SEVN",   # Seven Hills Realty Trust
    "LOAN",   # Manhattan Bridge Capital
    "REFI",   # Chicago Atlantic Real Estate Finance
    # Less likely to have coupon bucket tables
    "NREF",   # NexPoint Real Estate Finance
]

# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class CouponBucket:
    label: str          # e.g. "2.0-2.5%", ">=6%", "Fixed"
    value: Optional[float] = None       # notional / fair value in $M or $B
    pct_of_portfolio: Optional[float] = None
    unit: str = ""      # "$M", "$B", "%", etc.


@dataclass
class CouponAllocationResult:
    ticker: str
    filing_type: str
    period: str          # e.g. "2024-09-30"
    filing_date: str
    buckets: List[CouponBucket] = field(default_factory=list)
    raw_table: str = ""  # the raw text of the best-matching table for debugging
    notes: str = ""


# ---------------------------------------------------------------------------
# Coupon table detection heuristics
# ---------------------------------------------------------------------------

# Patterns that suggest a row or header is coupon-related
_COUPON_HEADER_RE = re.compile(
    r"""(
        coupon | interest\s+rate | rate\s+range | yield |
        note\s+rate | pass.?through | fixed.?rate | floater |
        ARM | adjustable
    )""",
    re.IGNORECASE | re.VERBOSE,
)

# Rate-sensitivity scenario tables — these are NOT coupon allocations
_RATE_SCENARIO_RE = re.compile(
    r"""(
        change\s+in\s+interest\s+rate |
        basis\s+points? |
        \bbps\b |
        \-\d+\s+basis |
        \+\d+\s+basis |
        estimated\s+(?:percentage\s+)?change\s+in\s+(?:portfolio|net\s+interest|nav) |
        shock\s+scenario |
        parallel\s+shift |
        mortgage\s+basis |
        treasury\s+rate |
        ois\s+sofr |
        fed\s+funds |
        pay\s+rate |
        receive\s+rate |
        years\s+to\s+maturity |
        \bswap\b |
        preferred\s+stock |
        stockholders.*equity |
        redeemable\s+preferred |
        loan[\s-]*to[\s-]*value |
        \bltv\b |
        \bfico\b |
        credit\s+score |
        debt[\s-]*to[\s-]*income |
        variable\s+interest\s+entit |  # PMT: "Held by variable interest entities"
        sofr\s+floor                |  # TRTX: SOFR floor rate distribution tables
        interest\s+rate\s+floor     |  # TRTX: "interest rate floor" tables
        floor\s+rate                   # TRTX: floor rate tables
    )""",
    re.IGNORECASE | re.VERBOSE,
)

# ARM/Fixed/Floater/IO coupon-type breakdown (NLY-style)
_COUPON_TYPE_HEADER_RE = re.compile(
    r"""bond\s+coupon | coupon\s+type | coupon\s+structure""",
    re.IGNORECASE,
)
_COUPON_TYPE_LABELS = re.compile(
    r"""^(arm|fixed|floater|floating|interest.only|io|variable|hybrid)$""",
    re.IGNORECASE,
)

# WAC line in a summary table — "weighted average coupon rate  5.09%"
_WAC_LINE_RE = re.compile(
    r"""weighted\s+average\s+coupon""",
    re.IGNORECASE,
)

# Patterns for individual coupon bucket labels.
# Rate-range patterns require at least one explicit '%' so maturity ranges
# like "0 - 3 years" and "3 - 6 years" do NOT match.
_BUCKET_RE = re.compile(
    r"""(
        (?:less\s+than|below|<|<=|\u2264|under)\s*[\d.]+\s*%   |  # < N%
        (?:greater\s+than|above|>|>=|\u2265|over)\s*[\d.]+\s*% |  # > N%
        [\d.]+\s*%\s*(?:-|–|to)\s*[\d.]+\s*%                   |  # N% - M%
        [\d.]+\s*%\s*(?:and\s+(?:above|over|higher))?           |  # N% (and above)
        (?:fixed|floating|variable|hybrid)
    )""",
    re.IGNORECASE | re.VERBOSE,
)

# Labels that look like MBS structural categories, NOT coupon-rate buckets.
# "Fixed-rate pass-through", "Interest-only", "CMO", etc. can match _BUCKET_RE
# because of the (?:fixed|floating|variable|hybrid) alternative — but they're
# asset-type breakdowns, not coupon distribution rows.
_MBS_STRUCTURE_RE = re.compile(
    r"""(
        pass[\s-]*through           |
        \bcmo\b                     |
        interest[\s-]*only          |
        multifamily                 |
        reverse\s+mortgage          |
        credit\s+risk               |
        non[\s-]*qm                 |
        prime\s+jumbo               |
        adjustable[\s-]*rate        |
        agency\s+cmbs               |
        total\s+agency              |
        total\s+fixed               |
        total\s+[\w\s]*securities   |
        total\s+\d+[\s-]*year       |   # "Total 30-year fixed-rate mortgages"
        \d+[\s-]*year\s+fixed       |   # "15-year fixed-rate mortgages"
        \bIO\b                      |
        \bseries\s+[A-Z]\b          |   # "Series A, 7.50%..." preferred stock
        single[\s-]*asset           |   # CMBS loan type
        single[\s-]*borrower        |
        \bconduit\b                 |   # CMBS conduit
        fixed\s+interest\s+rate\s+jumbo |  # PMT jumbo loan label
        \bSFR\b                         |  # ABR: "SFR - Fixed Rate" (single-family residential)
        interest[\s-]*rate\s+swap       |  # EARN swap table rows
        \d[\d.\s]*%\s*(?:\w+\s+){0,3}notes?\b  |  # ABR/RWT: "7.875% Notes", "9.0% exchangeable senior notes"
        percentage\s+of\s+portfolio     |  # CIM summary row: "Fixed-rate percentage of portfolio"
        \bfloor\b                       |  # BXMT/TRTX: SOFR floor rate buckets
        floating\s+rate\s+(?:assets|liabilities|exposure|loans?|portfolio|corporate|debt)  |  # GPMT/BXMT floating rate structure rows
        net\s+floating                  |  # GPMT: "Net floating rate exposure"
        property\s+mortgage             |  # STWD: "Property Mortgages - Fixed/Variable rate"
        \bCRE\b                         |  # ACR: "CRE whole loans, floating-rate"
        whole\s+loans?                  |  # ACR/commercial: "whole loan" holdings
        non[\s-]*consolidated           |  # CMTG: "Fixed rate non-consolidated senior loans"
        subordinate\s+loan              |  # CMTG: "Retained fixed rate subordinate loans"
        loans?\s+receivable             |  # CMTG: "Floating rate loans receivable"
        non[\s-]*real[\s-]*estate       |  # ACR: "Fixed assets - non-real estate"
        ^\+\s*[\d]                      |  # BXMT: "+ 1.50% or less" (credit spread buckets)
        \bfinancings?\b                 |  # BXMT: "Floating rate portfolio financings"
        \brents?\b                      |  # CMTG: "Mixed-use property fixed rents"
        mixed[\s-]*use                  |  # CMTG: "Mixed-use property..."
        \bCMBS\b                           # ACR: "CMBS, fixed-rate" (commercial MBS loan type)
    )""",
    re.IGNORECASE | re.VERBOSE,
)

# Numeric value pattern (handles commas, parens for negatives, $)
_NUM_RE = re.compile(r"""^\(?\$?\s*([\d,]+(?:\.\d+)?)\s*\)?$""")

_PERCENT_RE = re.compile(r"""(\d[\d.]*)\s*%""")


def _parse_num(text: str) -> Optional[float]:
    text = text.strip().replace(",", "")
    m = _NUM_RE.match(text)
    if m:
        val = float(m.group(1))
        # Parens = negative
        if text.startswith("("):
            val = -val
        return val
    return None


# ---------------------------------------------------------------------------
# HTML table extraction
# ---------------------------------------------------------------------------

def _table_to_rows(table: Tag) -> List[List[str]]:
    """Convert a BeautifulSoup <table> to a list of row-lists of cell text."""
    rows = []
    for tr in table.find_all("tr"):
        cells = [td.get_text(" ", strip=True) for td in tr.find_all(["td", "th"])]
        if cells:
            rows.append(cells)
    return rows


def _score_table(rows: List[List[str]]) -> int:
    """
    Score how likely this table contains coupon allocation data.
    Higher = more likely.
    """
    score = 0
    flat_text = " ".join(c for row in rows for c in row).lower()

    # Hard disqualifier: rate-sensitivity scenario tables
    if _RATE_SCENARIO_RE.search(flat_text):
        return -100

    # Hard disqualifier: standalone TBA-only tables.
    # A table whose FIRST non-empty row header is "TBA Agency Securities" is a
    # dedicated TBA-notional table, not a portfolio coupon-bucket breakdown.
    # (TBA rows that appear within a larger coupon table are fine — we only
    # reject tables where "TBA Agency Securities" IS the title row.)
    first_header_cells = [c.strip() for row in rows for c in row if c.strip()]
    if first_header_cells:
        first_header = first_header_cells[0].lower()
        if re.search(r'\btba\s+agency\s+securities\b', first_header):
            return -100

    # Must have at least one coupon-related header word
    if _COUPON_HEADER_RE.search(flat_text):
        score += 10

    # Bonus for "allocation", "distribution", "weighted average"
    for kw in ["allocation", "distribution", "weighted average", "portfolio", "mbs", "agency"]:
        if kw in flat_text:
            score += 2

    # Count how many FIRST-COLUMN cells look like coupon bucket labels.
    # Only the label column matters — matching on data columns (like 5.20% appearing
    # as a time-series value) causes false positives on market-rate context tables.
    bucket_hits = sum(
        1 for row in rows if row and _BUCKET_RE.search(row[0])
    )
    score += bucket_hits * 3

    # Strong bonus: consecutive coupon percentages in a label column (e.g. 3.0%, 3.5%, 4.0%...)
    # These are the classic per-coupon-bucket tables
    label_pcts = []
    for row in rows:
        cell = row[0].strip() if row else ""
        m = re.match(r'^[≤≥<>]?\s*([\d.]+)\s*%?$', cell)
        if m:
            label_pcts.append(float(m.group(1)))
    if len(label_pcts) >= 3:
        # Check if they look like a monotonic coupon range (0-10% range)
        in_range = [p for p in label_pcts if 0.5 <= p <= 10.0]
        if len(in_range) >= 3:
            score += len(in_range) * 5

    # Hard disqualifier: if any bucket label contains a percentage > 15%, this is
    # almost certainly an LTV, FICO, or other non-coupon table (e.g. "25 - 30%",
    # "LTV <= 80%").  Real MBS coupon rates are always 0–15%.
    for row in rows:
        cell = row[0].strip() if row else ""
        if _BUCKET_RE.search(cell):
            for pct_val in re.findall(r'([\d.]+)\s*%', cell):
                if float(pct_val) > 15.0:
                    return -100

    # Penalize tables where bucket label cells are long (>40 chars average).
    # Real coupon buckets have short labels like "≤3.5%" or "3.0% - 3.5%".
    # Long labels indicate preferred-stock descriptions or similar, not rate buckets.
    bucket_label_cells = [
        row[0].strip() for row in rows
        if row and _BUCKET_RE.search(row[0]) and not _MBS_STRUCTURE_RE.search(row[0])
    ]
    if bucket_label_cells:
        avg_label_len = sum(len(c) for c in bucket_label_cells) / len(bucket_label_cells)
        if avg_label_len > 40:
            score -= 30

    # Bonus for coupon-type breakdown table (NLY-style)
    if _COUPON_TYPE_HEADER_RE.search(flat_text):
        score += 15

    # Penalty for very wide or very tall tables (financials overview)
    max_cols = max((len(r) for r in rows), default=0)
    if max_cols > 15:
        score -= 5
    if len(rows) > 50:
        score -= 5

    return score


# Matches a calendar date inside a table row (e.g. "September 30, 2022" or "2022-09-30")
_ROW_DATE_RE = re.compile(
    r"""(
        (?:january|february|march|april|may|june|july|august
           |september|october|november|december)
        \s+\d{1,2},?\s+\d{4}
        |
        \d{4}-\d{2}-\d{2}
    )""",
    re.IGNORECASE | re.VERBOSE,
)

_MONTH_NAMES = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}


def _row_date_to_ym(text: str) -> Optional[Tuple[int, int]]:
    """Return (year, month) from a date string, or None."""
    m = _ROW_DATE_RE.search(text)
    if not m:
        return None
    s = m.group(0).strip()
    # ISO format
    iso = re.match(r'(\d{4})-(\d{2})-\d{2}', s)
    if iso:
        return int(iso.group(1)), int(iso.group(2))
    # "Month DD, YYYY"
    parts = re.match(
        r'(january|february|march|april|may|june|july|august'
        r'|september|october|november|december)\s+\d+,?\s+(\d{4})',
        s, re.IGNORECASE)
    if parts:
        month = _MONTH_NAMES[parts.group(1).lower()]
        return int(parts.group(2)), month
    return None


def _extract_buckets_from_rows(
    rows: List[List[str]],
    period_end_date: Optional[str] = None,
) -> List[CouponBucket]:
    """
    Given the rows of a candidate table, extract coupon bucket rows.

    Handles multi-segment tables:
    - Maturity sub-tables (AGNC ≤15yr / 20yr / 30yr): returns the segment
      with the highest aggregate value (i.e. the 30-year section).
    - Multi-period comparison tables (current + prior year stacked): if
      `period_end_date` is supplied, prefers the segment whose context row
      contains a matching month/year, falling back to highest-value segment.
    """
    if not rows:
        return []

    # Find header row (first row with mostly non-numeric cells)
    header_idx = 0
    for i, row in enumerate(rows):
        non_num = sum(1 for c in row if _parse_num(c) is None and c.strip())
        if non_num >= len(row) * 0.5:
            header_idx = i
            break

    # Target year/month derived from period_end_date
    target_ym: Optional[Tuple[int, int]] = None
    if period_end_date:
        m = re.match(r'(\d{4})-(\d{2})', period_end_date)
        if m:
            target_ym = (int(m.group(1)), int(m.group(2)))

    # Collect buckets into contiguous segments.
    # A new segment starts when a non-bucket row interrupts a run of bucket rows.
    # Each segment also records the most-recently-seen date from its context rows.
    segments: List[List[CouponBucket]] = [[]]
    segment_dates: List[Optional[Tuple[int, int]]] = [None]
    current_date: Optional[Tuple[int, int]] = None
    in_bucket_run = False

    for row in rows[header_idx + 1:]:
        if not row:
            continue
        label_cell = row[0].strip()
        if not label_cell:
            continue

        is_bucket = (
            _BUCKET_RE.search(label_cell)
            and not _MBS_STRUCTURE_RE.search(label_cell)
        )

        if is_bucket:
            value_cells = row[1:]
            val = None
            pct = None
            for cell in value_cells:
                if val is None:
                    v = _parse_num(cell)
                    if v is not None:
                        val = v
                        continue
                if pct is None and "%" in cell:
                    m2 = _PERCENT_RE.search(cell)
                    if m2:
                        pct = float(m2.group(1))

            if val is not None or pct is not None:
                segments[-1].append(CouponBucket(
                    label=label_cell,
                    value=val,
                    pct_of_portfolio=pct,
                ))
                in_bucket_run = True
        else:
            # Check the context row for a date
            row_text = " ".join(label_cell for label_cell in row if label_cell.strip())
            detected = _row_date_to_ym(row_text)
            if detected:
                current_date = detected

            # Non-bucket row after a run of buckets — start a new segment
            if in_bucket_run:
                segments.append([])
                segment_dates.append(current_date)
                in_bucket_run = False
            elif current_date and segment_dates:
                # Update the date for the current (not-yet-started) segment
                segment_dates[-1] = current_date

    # Drop empty segments (keep parallel segment_dates in sync)
    non_empty = [(s, d) for s, d in zip(segments, segment_dates) if s]
    if not non_empty:
        return []
    if len(non_empty) == 1:
        return non_empty[0][0]

    segments_clean, dates_clean = zip(*non_empty)

    # Prefer the segment whose date context matches the filing period
    if target_ym:
        date_matches = [
            i for i, d in enumerate(dates_clean) if d == target_ym
        ]
        if date_matches:
            # Among matching segments, pick the one with the highest value
            def _seg_total(seg):
                return sum(b.value for b in seg if b.value is not None)
            return max((segments_clean[i] for i in date_matches), key=_seg_total)

    # Fallback: highest aggregate value (usually the 30-year section)
    def _segment_total(seg: List[CouponBucket]) -> float:
        return sum(b.value for b in seg if b.value is not None)

    return max(segments_clean, key=_segment_total)


def _extract_coupon_type_buckets(rows: List[List[str]]) -> List[CouponBucket]:
    """
    Extract ARM/Fixed/Floater/IO coupon-type breakdown (NLY-style).
    The header row identifies coupon-type columns; a Total row provides the
    aggregate values for each type.

    NLY tables have inconsistent column alignment across data rows (some rows
    have "$" in a separate cell, others don't), so we extract from the Total
    row rather than summing per-product rows.  The Total row contains all
    positive numerics in the same order as the coupon-type header columns.
    """
    if not rows:
        return []

    # Find header row containing coupon type labels
    header_idx = None
    coupon_col_indices: List[Tuple[int, str]] = []  # (col_idx, label)
    for i, row in enumerate(rows):
        matches = [(j, cell.strip()) for j, cell in enumerate(row)
                   if _COUPON_TYPE_LABELS.match(cell.strip())]
        if len(matches) >= 2:
            header_idx = i
            coupon_col_indices = matches
            break

    if header_idx is None or not coupon_col_indices:
        return []

    n_types = len(coupon_col_indices)

    # Strategy 1: read from a "Total" row.
    # Collect all positive numerics in the Total row — they appear in the same
    # left-to-right order as the coupon-type columns (ARM, Fixed, Floater, IO, …).
    for row in rows[header_idx + 1:]:
        label0 = row[0].strip().lower() if row else ""
        if re.match(r'^total\b', label0):
            nums = [v for c in row[1:] if (v := _parse_num(c)) is not None and v > 0]
            if len(nums) >= n_types:
                return [
                    CouponBucket(label=lbl, value=nums[i] if nums[i] > 0 else None)
                    for i, (_, lbl) in enumerate(coupon_col_indices)
                ]

    # Strategy 2 (fallback): sum down each column, probing col+1 for "$" layouts.
    totals: Dict[str, float] = {label: 0.0 for _, label in coupon_col_indices}
    for row in rows[header_idx + 1:]:
        label0 = row[0].strip().lower() if row else ""
        if re.match(r'^total\b', label0):
            continue  # skip Total rows to avoid double-counting
        for col_idx, label in coupon_col_indices:
            v = None
            for probe in (col_idx, col_idx + 1):
                if probe < len(row):
                    v = _parse_num(row[probe])
                    if v is not None:
                        break
            if v is not None and v > 0:
                totals[label] += v

    return [
        CouponBucket(label=label, value=total if total > 0 else None)
        for label, total in totals.items()
    ]


def _extract_wac_from_rows(rows: List[List[str]]) -> Optional[CouponBucket]:
    """
    Look for a 'Weighted average coupon rate' line and return it as a single bucket.
    Used when no distribution table is available.
    """
    for row in rows:
        for j, cell in enumerate(row):
            if _WAC_LINE_RE.search(cell):
                # Look for a percent value in this or the next few cells
                for k in range(j, min(j + 5, len(row))):
                    m = _PERCENT_RE.search(row[k])
                    if m:
                        return CouponBucket(
                            label="Weighted Average Coupon",
                            pct_of_portfolio=float(m.group(1)),
                        )
    return None


# ---------------------------------------------------------------------------
# Plain-text table extraction (fallback for text-based filings)
# ---------------------------------------------------------------------------

def _extract_from_text(text: str) -> List[CouponBucket]:
    """
    Fallback: scan filing plain text for coupon allocation lines.
    Looks for patterns like:
        3.00% - 3.49%    $12,345    25.3%
        >= 6.00%         $8,000     16.1%
    """
    buckets = []
    lines = text.splitlines()
    for line in lines:
        if not _BUCKET_RE.search(line):
            continue
        # Try to pull out numbers from the same line
        nums = [float(x.replace(",", "")) for x in re.findall(r"[\d,]+(?:\.\d+)?", line)]
        pct_m = _PERCENT_RE.findall(line)
        # Heuristic: if there are 2+ numbers, first is often value, last percent-ish is pct
        val = nums[0] if nums else None
        pct = float(pct_m[-1]) if pct_m and float(pct_m[-1]) <= 100 else None
        label_m = _BUCKET_RE.search(line)
        label = label_m.group(0).strip() if label_m else line[:40].strip()
        if val or pct:
            buckets.append(CouponBucket(label=label, value=val, pct_of_portfolio=pct))
    return buckets


# ---------------------------------------------------------------------------
# Core HTML extraction helper
# ---------------------------------------------------------------------------

def _parse_html_tables(
    client: SECAPIClient,
    ticker: str,
    doc_url: str,
    doc_filename: str,
    period_end_date: Optional[str] = None,
) -> Tuple[List[CouponBucket], str, int]:
    """
    Fetch an HTML document, score its tables, and return
    (best_buckets, raw_table_text, best_score).
    period_end_date (YYYY-MM-DD) is used to pick the right section in
    multi-period comparison tables.
    """
    logger.info(f"[{ticker}] Parsing HTML tables from {doc_filename}")
    resp = _sec_get(doc_url, headers=client.headers)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.content, "html.parser")
    tables = soup.find_all("table")
    logger.info(f"[{ticker}] Found {len(tables)} HTML tables")

    scored_tables = [(score := _score_table(rows := _table_to_rows(tbl)), rows)
                     for tbl in tables]

    best_buckets: List[CouponBucket] = []
    raw_table_text = ""
    best_score = -1

    # Pass 1: numeric bucket table (3.0% – 3.5%, etc.)
    for score, rows in sorted(scored_tables, key=lambda x: x[0], reverse=True):
        if score < 5:
            break
        buckets = _extract_buckets_from_rows(rows, period_end_date=period_end_date)
        if buckets:
            # Discard all-TBA results (MITT-style tables with only TBA positions)
            if all(re.search(r'\bTBA\b', b.label, re.IGNORECASE) for b in buckets):
                continue
            # Discard single-generic-label results (NREF/RC "Fixed" or "Fixed rate" alone)
            _GENERIC_LABELS = re.compile(r'^(fixed|floating|variable|fixed\s+rate|floating\s+rate)$', re.IGNORECASE)
            if len(buckets) <= 1 and all(_GENERIC_LABELS.match(b.label.strip()) for b in buckets):
                continue
            # Discard single-numeric-bucket results with negative or suspiciously small
            # values — these are likely individual TBA/swap positions, not a distribution.
            if len(buckets) == 1 and buckets[0].value is not None and buckets[0].value <= 0:
                continue
            best_score = score
            best_buckets = buckets
            raw_table_text = "\n".join(" | ".join(r) for r in rows[:20])
            break

    # Pass 2: coupon-type breakdown (ARM/Fixed/Floater NLY-style)
    if not best_buckets:
        for score, rows in sorted(scored_tables, key=lambda x: x[0], reverse=True):
            if score < -50:
                break
            ct_buckets = _extract_coupon_type_buckets(rows)
            if ct_buckets:
                # Discard single-generic-label results
                _GENERIC_LABELS = re.compile(r'^(fixed|floating|variable|fixed\s+rate|floating\s+rate)$', re.IGNORECASE)
                if len(ct_buckets) <= 1 and all(_GENERIC_LABELS.match(b.label.strip()) for b in ct_buckets):
                    continue
                best_score = score
                best_buckets = ct_buckets
                raw_table_text = "\n".join(" | ".join(r) for r in rows[:20])
                break

    # Pass 3: weighted-average coupon summary
    if not best_buckets:
        for score, rows in scored_tables:
            wac = _extract_wac_from_rows(rows)
            if wac:
                best_buckets = [wac]
                raw_table_text = "(WAC summary)"
                best_score = score
                break

    return best_buckets, raw_table_text, best_score


# ---------------------------------------------------------------------------
# Filing fetcher + parser
# ---------------------------------------------------------------------------

def fetch_and_extract(
    client: SECAPIClient,
    ticker: str,
    filing_type: str = "10-Q",
) -> Optional[CouponAllocationResult]:
    """
    Fetch the most recent filing of `filing_type` for `ticker` and extract
    coupon allocation data.
    """
    logger.info(f"[{ticker}] Fetching {filing_type}...")
    result = client.fetch_filing(ticker, filing_type, save_to_file=False)
    if not result:
        logger.warning(f"[{ticker}] No filing found for {filing_type}")
        return None

    logger.info(f"[{ticker}] Got filing dated {result.filing_date} (period: {result.period_end_date})")

    # Find the primary .htm document (already fetched in result.documents)
    primary_doc = None
    if result.documents:
        from sec_api_client import _is_main_filing_document
        for doc in result.documents:
            fn = doc.filename.lower()
            if (fn.endswith(".htm") or fn.endswith(".html")) and _is_main_filing_document(doc, filing_type):
                primary_doc = doc
                break
        if primary_doc is None:
            for doc in result.documents:
                if doc.filename.lower().endswith((".htm", ".html")):
                    primary_doc = doc
                    break

    best_buckets: List[CouponBucket] = []
    raw_table_text = ""
    best_score = -1

    if primary_doc:
        try:
            best_buckets, raw_table_text, best_score = _parse_html_tables(
                client, ticker, primary_doc.url, primary_doc.filename,
                period_end_date=result.period_end_date,
            )
        except Exception as e:
            logger.warning(f"[{ticker}] HTML table parsing failed: {e}")

    # Fallback: plain-text scan
    if not best_buckets:
        logger.info(f"[{ticker}] Falling back to plain-text scan")
        best_buckets = _extract_from_text(result.text)
        raw_table_text = "(plain-text scan)"

    if not best_buckets:
        logger.warning(f"[{ticker}] No coupon allocation data found")

    return CouponAllocationResult(
        ticker=ticker,
        filing_type=result.filing_type,
        period=result.period_end_date or result.filing_date,
        filing_date=result.filing_date,
        buckets=best_buckets,
        raw_table=raw_table_text,
        notes=f"table_score={best_score}",
    )


def fetch_and_extract_from_filing_info(
    client: SECAPIClient,
    ticker: str,
    filing_info: Dict,
) -> Optional[CouponAllocationResult]:
    """
    Extract coupon allocation from a specific filing described by a filing_info
    dict (as returned by get_historical_10q_filings / get_historical_10k_filings).
    Only fetches the primary HTML document — no exhibits, no XBRL.
    """
    index_url = filing_info["index_url"]
    filing_type = filing_info.get("form", "10-Q")
    filing_date = filing_info.get("date", "")
    period_end_date = filing_info.get("period_end_date") or filing_date

    logger.info(f"[{ticker}] Processing {filing_type} period={period_end_date} filed={filing_date}")

    from sec_api_client import _is_main_filing_document
    documents = client.get_documents_from_index(index_url)
    if not documents:
        logger.warning(f"[{ticker}] No documents found at {index_url}")
        return None

    # Pick the primary .htm filing document
    primary_doc = None
    for doc in documents:
        fn = doc.filename.lower()
        if (fn.endswith(".htm") or fn.endswith(".html")) and _is_main_filing_document(doc, filing_type):
            primary_doc = doc
            break
    if primary_doc is None:
        for doc in documents:
            if doc.filename.lower().endswith((".htm", ".html")):
                primary_doc = doc
                break

    if not primary_doc:
        logger.warning(f"[{ticker}] No HTML document found for {index_url}")
        return None

    best_buckets: List[CouponBucket] = []
    raw_table_text = ""
    best_score = -1

    try:
        best_buckets, raw_table_text, best_score = _parse_html_tables(
            client, ticker, primary_doc.url, primary_doc.filename,
            period_end_date=period_end_date,
        )
    except Exception as e:
        logger.warning(f"[{ticker}] HTML parsing failed for {primary_doc.filename}: {e}")

    if not best_buckets:
        logger.warning(f"[{ticker}] No coupon allocation data for period {period_end_date}")

    return CouponAllocationResult(
        ticker=ticker,
        filing_type=filing_type,
        period=period_end_date,
        filing_date=filing_date,
        buckets=best_buckets,
        raw_table=raw_table_text,
        notes=f"table_score={best_score}",
    )


def fetch_and_extract_all_historical(
    client: SECAPIClient,
    ticker: str,
    filing_type: str = "10-Q",
    years_back: int = 5,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    skip_periods: Optional[set] = None,
) -> List[CouponAllocationResult]:
    """
    Fetch and extract coupon allocation for ALL historical filings of
    `filing_type` for `ticker` within the date range.

    skip_periods: set of period strings already collected (to resume runs).
    """
    if filing_type == "10-K":
        filings = client.get_historical_10k_filings(
            ticker, years_back=years_back, start_date=start_date, end_date=end_date
        )
    else:
        filings = client.get_historical_10q_filings(
            ticker, years_back=years_back, start_date=start_date, end_date=end_date
        )

    if not filings:
        logger.warning(f"[{ticker}] No {filing_type} filings found in range")
        return []

    # Sort oldest-first so output is chronological
    filings.sort(key=lambda f: f.get("period_end_date") or f.get("date") or "")

    results = []
    for filing_info in filings:
        period = filing_info.get("period_end_date") or filing_info.get("date") or ""
        if skip_periods and period in skip_periods:
            logger.info(f"[{ticker}] Skipping already-collected period {period}")
            continue
        try:
            r = fetch_and_extract_from_filing_info(client, ticker, filing_info)
            if r:
                results.append(r)
        except Exception as e:
            logger.error(f"[{ticker}] Error processing {period}: {e}", exc_info=True)

    return results


# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------

def print_result(r: CouponAllocationResult):
    print(f"\n{'='*60}")
    print(f"  {r.ticker}  |  {r.filing_type}  |  period: {r.period}  |  filed: {r.filing_date}")
    print(f"{'='*60}")
    if not r.buckets:
        print("  (no coupon allocation data extracted)")
        return
    col_w = max(len(b.label) for b in r.buckets) + 2
    print(f"  {'Coupon Range':<{col_w}}  {'Value':>14}  {'% Portfolio':>12}")
    print(f"  {'-'*col_w}  {'-'*14}  {'-'*12}")
    for b in r.buckets:
        val_str = f"{b.value:>14,.1f}" if b.value is not None else f"{'—':>14}"
        pct_str = f"{b.pct_of_portfolio:>11.1f}%" if b.pct_of_portfolio is not None else f"{'—':>12}"
        print(f"  {b.label:<{col_w}}  {val_str}  {pct_str}")
    print(f"  [{r.notes}]")


def write_csv(results: List[CouponAllocationResult], path: str):
    rows = []
    for r in results:
        for b in r.buckets:
            rows.append({
                "ticker": r.ticker,
                "filing_type": r.filing_type,
                "period": r.period,
                "filing_date": r.filing_date,
                "coupon_label": b.label,
                "value": b.value,
                "pct_of_portfolio": b.pct_of_portfolio,
            })
    if not rows:
        logger.warning("No data rows to write")
        return
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    logger.info(f"Wrote {len(rows)} rows to {path}")


def write_json(results: List[CouponAllocationResult], path: str):
    data = []
    for r in results:
        data.append({
            "ticker": r.ticker,
            "filing_type": r.filing_type,
            "period": r.period,
            "filing_date": r.filing_date,
            "buckets": [
                {"label": b.label, "value": b.value, "pct_of_portfolio": b.pct_of_portfolio}
                for b in r.buckets
            ],
            "notes": r.notes,
        })
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    logger.info(f"Wrote JSON to {path}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _load_existing_periods(csv_path: str) -> set:
    """Read a CSV and return the set of (ticker, period) already collected."""
    seen = set()
    if not os.path.exists(csv_path):
        return seen
    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row.get("ticker") and row.get("period"):
                seen.add((row["ticker"].upper(), row["period"]))
    return seen


def main():
    parser = argparse.ArgumentParser(description="Extract mREIT coupon allocation from SEC filings")
    parser.add_argument("tickers", nargs="*", help="Ticker symbols (default: all MREIT_TICKERS)")
    parser.add_argument("--filing", default="10-Q", help="Filing type (default: 10-Q)")
    parser.add_argument("--output", default=None, help="Output CSV path")
    parser.add_argument("--json", default=None, dest="json_out", help="Output JSON path")
    parser.add_argument("--user-agent", default="mreit-coupon-extractor/1.0 research@example.com",
                        help="SEC user-agent string")
    parser.add_argument("--data-dir", default="data", help="Directory to cache SEC downloads")
    parser.add_argument("--debug-table", action="store_true",
                        help="Print the raw best-matched table for each ticker")
    # Historical mode
    parser.add_argument("--historical", action="store_true",
                        help="Fetch all historical filings instead of just the most recent")
    parser.add_argument("--years-back", type=int, default=5,
                        help="How many years back to collect (historical mode, default: 5)")
    parser.add_argument("--start-date", default=None,
                        help="Start date for historical range YYYY-MM-DD")
    parser.add_argument("--end-date", default=None,
                        help="End date for historical range YYYY-MM-DD (default: today)")
    parser.add_argument("--append", action="store_true",
                        help="Append to existing CSV, skipping already-collected periods")
    args = parser.parse_args()

    tickers = [t.upper() for t in args.tickers] if args.tickers else MREIT_TICKERS

    client = SECAPIClient(
        data_dir=args.data_dir,
        user_agent=args.user_agent,
        rate_limit_delay=0.5,
        company_tickers_path=os.path.join(args.data_dir, "company_tickers.json"),
    )

    # Pre-load already-collected periods when appending
    existing_periods: set = set()
    if args.append and args.output:
        existing_periods = _load_existing_periods(args.output)
        logger.info(f"Loaded {len(existing_periods)} already-collected (ticker, period) pairs")

    results: List[CouponAllocationResult] = []
    total_filings = 0

    for ticker in tickers:
        try:
            if args.historical:
                skip = {period for (t, period) in existing_periods if t == ticker}
                ticker_results = fetch_and_extract_all_historical(
                    client, ticker,
                    filing_type=args.filing,
                    years_back=args.years_back,
                    start_date=args.start_date,
                    end_date=args.end_date,
                    skip_periods=skip,
                )
                for r in ticker_results:
                    results.append(r)
                    print_result(r)
                    if args.debug_table and r.raw_table:
                        print("\n  --- raw table ---")
                        for line in r.raw_table.splitlines()[:30]:
                            print(f"  {line}")
                total_filings += len(ticker_results)
            else:
                r = fetch_and_extract(client, ticker, filing_type=args.filing)
                if r:
                    results.append(r)
                    print_result(r)
                    if args.debug_table and r.raw_table:
                        print("\n  --- raw table ---")
                        for line in r.raw_table.splitlines()[:30]:
                            print(f"  {line}")
                total_filings += 1
        except Exception as e:
            logger.error(f"[{ticker}] Unhandled error: {e}", exc_info=True)

    if args.output:
        if args.append and os.path.exists(args.output):
            # Append new rows to the existing file
            new_rows = []
            for r in results:
                for b in r.buckets:
                    key = (r.ticker, r.period)
                    if key not in existing_periods:
                        new_rows.append({
                            "ticker": r.ticker,
                            "filing_type": r.filing_type,
                            "period": r.period,
                            "filing_date": r.filing_date,
                            "coupon_label": b.label,
                            "value": b.value,
                            "pct_of_portfolio": b.pct_of_portfolio,
                        })
            if new_rows:
                with open(args.output, "a", newline="", encoding="utf-8") as f:
                    writer = csv.DictWriter(f, fieldnames=list(new_rows[0].keys()))
                    writer.writerows(new_rows)
                logger.info(f"Appended {len(new_rows)} rows to {args.output}")
            else:
                logger.info("No new rows to append")
        else:
            write_csv(results, args.output)

    if args.json_out:
        write_json(results, args.json_out)

    # Summary
    found = sum(1 for r in results if r.buckets)
    if args.historical:
        print(f"\nDone. {found}/{total_filings} filings had extractable coupon allocation data.")
    else:
        print(f"\nDone. {found}/{len(tickers)} tickers had extractable coupon allocation data.")


if __name__ == "__main__":
    main()
