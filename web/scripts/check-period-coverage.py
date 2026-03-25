#!/usr/bin/env python3
"""Print coverage for a single period across mreit.json tickers."""
import argparse
import json
import os


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("period", nargs="?", default="2025-12-31")
    p.add_argument(
        "--json",
        default=os.path.join(
            os.path.dirname(__file__), "..", "data", "mreit.json"
        ),
    )
    args = p.parse_args()
    path = os.path.abspath(args.json)
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    hdr = (
        "ticker\tfiling_type\tslices\thas_wac\thas_lev\thas_nim\thas_fin\t"
        "wac\tleverage\tnim\tfinancing_rate"
    )
    print(hdr)

    def fmt(x):
        if x is None:
            return "-"
        if isinstance(x, (int, float)):
            return f"{x:.6g}"
        return str(x)

    for td in sorted(data.get("tickers", []), key=lambda x: x.get("ticker", "")):
        t = td.get("ticker", "")
        row = next((x for x in td.get("periods", []) if x.get("period") == args.period), None)
        if not row:
            print(f"{t}\tMISSING\t0\tFalse\tFalse\tFalse\tFalse\t-\t-\t-\t-")
            continue
        slices = row.get("slices") or []
        w = row.get("wac")
        lev = row.get("leverage")
        nim = row.get("netInterestMargin")
        fin = row.get("financingRate")
        print(
            f"{t}\t{row.get('filing_type')}\t{len(slices)}\t{w is not None}\t{lev is not None}\t"
            f"{nim is not None}\t{fin is not None}\t{fmt(w)}\t{fmt(lev)}\t{fmt(nim)}\t{fmt(fin)}"
        )


if __name__ == "__main__":
    main()
