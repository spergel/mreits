import fs from "fs";
import path from "path";
import Papa from "papaparse";
import type { SiteData, TickerData, PeriodSnapshot, CouponSlice, DataMode } from "../src/types/mreit";

// Tickers where the "value" column already contains percentage weights (not dollar UPB)
const PCT_VALUE_TICKERS = new Set(["ADAM", "NYMT"]);

interface RawRow {
  ticker: string;
  filing_type: string;
  period: string;
  filing_date: string;
  coupon_label: string;
  value: string;
  pct_of_portfolio: string;
}

function parseNum(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

// Extract leading numeric value from a coupon label for sort ordering
function labelSortKey(label: string): [number, string] {
  const m = label.match(/(\d[\d.]*)/);
  if (m) return [parseFloat(m[1]), label];
  // Categorical labels sort first
  return [-1, label];
}

function sortLabels(labels: string[]): string[] {
  return [...labels].sort((a, b) => {
    const [na, sa] = labelSortKey(a);
    const [nb, sb] = labelSortKey(b);
    if (na !== nb) return na - nb;
    return sa.localeCompare(sb);
  });
}

function buildTickerData(ticker: string, rows: RawRow[]): TickerData {
  // Group by period
  const byPeriod = new Map<string, RawRow[]>();
  for (const row of rows) {
    const arr = byPeriod.get(row.period) ?? [];
    arr.push(row);
    byPeriod.set(row.period, arr);
  }

  // Determine data mode
  // ADAM/NYMT: value IS the percentage weight
  // Others: use value (dollar UPB in thousands), normalize per period to pct
  const dataMode: DataMode = PCT_VALUE_TICKERS.has(ticker) ? "pct" : "value";

  let hasShorts = false;
  const allLabelSet = new Set<string>();
  const periods: PeriodSnapshot[] = [];

  for (const [period, periodRows] of byPeriod) {
    // Filter negatives (ORC short TBA positions)
    const positiveRows = periodRows.filter((r) => {
      const v = parseNum(r.value);
      if (v !== null && v < 0) { hasShorts = true; return false; }
      return true;
    });

    if (positiveRows.length === 0) continue;

    let slices: CouponSlice[];

    if (dataMode === "pct") {
      // Value column contains percentage directly
      slices = positiveRows.map((r) => {
        const pct = parseNum(r.value) ?? 0;
        allLabelSet.add(r.coupon_label);
        return { label: r.coupon_label, displayPct: pct, rawValue: null };
      });
    } else {
      // Dollar UPB — normalize per period
      const values = positiveRows.map((r) => parseNum(r.value) ?? 0);
      const total = values.reduce((s, v) => s + v, 0);
      slices = positiveRows.map((r, i) => {
        const rawValue = values[i];
        const displayPct = total > 0 ? (rawValue / total) * 100 : 0;
        allLabelSet.add(r.coupon_label);
        return { label: r.coupon_label, displayPct, rawValue };
      });
    }

    // Keep slices in the order they appear in the filing (label column order)
    const filing = positiveRows[0];
    periods.push({
      period,
      filing_date: filing.filing_date,
      filing_type: filing.filing_type,
      slices,
    });
  }

  // Sort periods ascending
  periods.sort((a, b) => a.period.localeCompare(b.period));

  const allLabels = sortLabels([...allLabelSet]);

  return {
    ticker,
    dataMode,
    hasShorts,
    periods,
    allLabels,
    latestPeriod: periods[periods.length - 1],
  };
}

function main() {
  const csvPath = path.join(process.cwd(), "..", "data", "mreit_master.csv");
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found at ${csvPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(csvPath, "utf-8");
  const { data } = Papa.parse<RawRow>(raw, { header: true, skipEmptyLines: true });

  // Group by ticker
  const byTicker = new Map<string, RawRow[]>();
  for (const row of data) {
    const arr = byTicker.get(row.ticker) ?? [];
    arr.push(row);
    byTicker.set(row.ticker, arr);
  }

  const tickers: TickerData[] = [];
  for (const [ticker, rows] of byTicker) {
    const td = buildTickerData(ticker, rows);
    if (td.periods.length > 0) tickers.push(td);
  }

  // Sort tickers: by number of periods desc, then alphabetically
  tickers.sort((a, b) => {
    if (b.periods.length !== a.periods.length) return b.periods.length - a.periods.length;
    return a.ticker.localeCompare(b.ticker);
  });

  const siteData: SiteData = {
    tickers,
    generatedAt: new Date().toISOString(),
  };

  const outPath = path.join(process.cwd(), "..", "data", "mreit.json");
  fs.writeFileSync(outPath, JSON.stringify(siteData, null, 2));
  console.log(`✓ Built ${tickers.length} tickers → ${outPath}`);
  tickers.forEach((t) =>
    console.log(`  ${t.ticker}: ${t.periods.length} periods, mode=${t.dataMode}${t.hasShorts ? " [has shorts]" : ""}`)
  );
}

main();
