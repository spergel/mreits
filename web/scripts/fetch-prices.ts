import fs from "fs";
import path from "path";
import Papa from "papaparse";

interface MasterRow {
  ticker: string;
}

interface PriceRow {
  Date: string;
  Close: string;
}

interface OutRow {
  ticker: string;
  period: string;
  close: number;
}

function quarterEndFromDate(date: string): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  if (month <= 3) return `${year}-03-31`;
  if (month <= 6) return `${year}-06-30`;
  if (month <= 9) return `${year}-09-30`;
  return `${year}-12-31`;
}

async function fetchCsv(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "mreit-site contact@example.com" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function main() {
  const masterPath = path.join(process.cwd(), "data", "mreit_master.csv");
  const masterRaw = fs.readFileSync(masterPath, "utf-8");
  const { data } = Papa.parse<MasterRow>(masterRaw, { header: true, skipEmptyLines: true });
  const tickers = [...new Set(data.map((r) => r.ticker?.trim().toUpperCase()).filter(Boolean) as string[])];

  const out: OutRow[] = [];
  for (const t of tickers) {
    try {
      const url = `https://stooq.com/q/d/l/?s=${t.toLowerCase()}.us&i=d`;
      const csv = await fetchCsv(url);
      const parsed = Papa.parse<PriceRow>(csv, { header: true, skipEmptyLines: true }).data;
      const byQuarter = new Map<string, { date: string; close: number }>();
      for (const r of parsed) {
        const date = (r.Date || "").trim();
        const close = parseFloat((r.Close || "").trim());
        if (!date || Number.isNaN(close)) continue;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        const qEnd = quarterEndFromDate(date);
        // Use last available trading day in each quarter (covers weekend/holiday quarter-ends).
        const existing = byQuarter.get(qEnd);
        if (!existing || date > existing.date) {
          byQuarter.set(qEnd, { date, close });
        }
      }
      for (const [period, px] of byQuarter.entries()) {
        out.push({ ticker: t, period, close: px.close });
      }
    } catch {
      // Silent skip for tickers with unavailable market feed
    }
  }

  const header = "# Quarter-end close prices from Stooq\n";
  const outPath = path.join(process.cwd(), "data", "prices.csv");
  fs.writeFileSync(outPath, header + Papa.unparse(out, { columns: ["ticker", "period", "close"] }));
  console.log(`Wrote ${out.length} rows to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

