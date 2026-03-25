#!/usr/bin/env python3
"""
Summarize how complete mreit.json is across every ticker and period.

Metrics: WAC, BVPS, leverage, financing rate, NIM, swap notional, unrestricted cash,
market price, P/B (anything the site can show).

Usage:
  python scripts/check-data-coverage.py
  python scripts/check-data-coverage.py --verbose
  python scripts/check-data-coverage.py --json out/coverage.json
"""

from __future__ import annotations

import argparse
import json
import os
from typing import Any, Dict, List, Tuple

METRICS: List[Tuple[str, str]] = [
    ("wac", "WAC"),
    ("bvps", "BVPS"),
    ("leverage", "Lev"),
    ("financingRate", "Fin"),
    ("netInterestMargin", "NIM"),
    ("swapNotional", "Swap"),
    ("unrestrictedCash", "Cash"),
    ("marketPrice", "Mkt"),
    ("priceToBook", "P/B"),
]


def pct(n: int, d: int) -> str:
    if d == 0:
        return "n/a"
    return f"{100.0 * n / d:.0f}%"


def main() -> int:
    p = argparse.ArgumentParser(description="mreit.json field coverage by ticker")
    p.add_argument(
        "--json",
        dest="json_path",
        default=None,
        help="Write machine-readable summary to this path",
    )
    p.add_argument(
        "--mreit-json",
        default=os.path.join(os.path.dirname(__file__), "..", "data", "mreit.json"),
    )
    p.add_argument(
        "--verbose",
        action="store_true",
        help="List periods missing WAC (coupon pipeline) per ticker",
    )
    args = p.parse_args()

    path = os.path.abspath(args.mreit_json)
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    tickers = sorted(data.get("tickers", []), key=lambda x: x.get("ticker", ""))

    rows_out: List[Dict[str, Any]] = []
    totals = {k: 0 for k, _ in METRICS}
    total_periods = 0

    # header
    hdr = (
        "ticker  periods  "
        + "  ".join(f"{abbr:>5}" for _, abbr in METRICS)
        + "  notes"
    )
    print(hdr)
    print("-" * len(hdr))

    for td in tickers:
        t = td.get("ticker", "?")
        periods = td.get("periods") or []
        n = len(periods)
        total_periods += n
        counts = {k: 0 for k, _ in METRICS}
        missing_wac_periods: List[str] = []

        for row in periods:
            per = row.get("period", "")
            for key, _ in METRICS:
                v = row.get(key)
                if v is not None:
                    counts[key] += 1
                    totals[key] += 1
            if row.get("wac") is None:
                missing_wac_periods.append(per)

        row_summary: Dict[str, Any] = {
            "ticker": t,
            "periods": n,
            "filled": {k: counts[k] for k, _ in METRICS},
        }
        if missing_wac_periods:
            row_summary["missing_wac_periods"] = missing_wac_periods

        rows_out.append(row_summary)

        note = ""
        if counts["wac"] < n:
            note = f"WAC gap {n - counts['wac']}/{n}"

        parts = [
            f"{t:<6}  {n:>7}  ",
        ]
        for key, abbr in METRICS:
            c = counts[key]
            parts.append(f"{pct(c, n):>5}  ")
        parts.append(note)
        print("".join(parts).rstrip())

        if args.verbose and missing_wac_periods:
            print(f"         missing WAC: {', '.join(missing_wac_periods)}")

    print("-" * len(hdr))
    all_parts = [
        f"{'ALL':<6}  {total_periods:>7}  ",
    ]
    for key, _ in METRICS:
        all_parts.append(f"{pct(totals[key], total_periods):>5}  ")
    print("".join(all_parts).rstrip())

    print(
        "\nLegend: % of periods with a non-null value. "
        "WAC needs coupon rows in web/data/mreit_master.csv (see mreit_coupon_extractor.py); "
        "BVPS: npm run fetch-bvps; "
        "leverage/NIM/fin/cash: npm run fetch-fundamentals and npm run fetch-fundamentals-html; "
        "prices: npm run fetch-prices. "
        "Refresh everything: npm run fetch-all-data (HTML pass is slow)."
    )

    if args.json_path:
        out = {
            "mreitJson": path,
            "totalPeriods": total_periods,
            "totals": {k: totals[k] for k, _ in METRICS},
            "tickers": rows_out,
        }
        _dir = os.path.dirname(os.path.abspath(args.json_path))
        if _dir:
            os.makedirs(_dir, exist_ok=True)
        with open(args.json_path, "w", encoding="utf-8") as f:
            json.dump(out, f, indent=2)
        print(f"\nWrote {args.json_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
