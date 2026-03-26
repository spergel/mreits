import fs from "fs";
import path from "path";
import Papa from "papaparse";
import type { SiteData, TickerData, PeriodSnapshot, CouponSlice, DataMode, RatePoint } from "../src/types/mreit";

// Tickers where the "value" column already contains percentage weights (not dollar UPB)
const PCT_VALUE_TICKERS = new Set(["ADAM"]);

interface RawRow {
  ticker: string;
  filing_type: string;
  period: string;
  filing_date: string;
  coupon_label: string;
  value: string;
  pct_of_portfolio: string;
}

interface ValidationStats {
  droppedRows: number;
  warnings: string[];
}

function parseNum(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeRawRows(rows: RawRow[]): { rows: RawRow[]; stats: ValidationStats } {
  const stats: ValidationStats = { droppedRows: 0, warnings: [] };
  const normalized: RawRow[] = [];

  for (const row of rows) {
    const ticker = row.ticker.trim().toUpperCase();
    const filing_type = row.filing_type.trim();
    const period = row.period.trim();
    const filing_date = row.filing_date.trim();
    const coupon_label = row.coupon_label.trim();
    const value = row.value.trim();
    const pct_of_portfolio = row.pct_of_portfolio.trim();

    const isWacOnlyRow = /weighted\s+average\s+coupon/i.test(coupon_label);
    const pctNum = parseNum(pct_of_portfolio);
    const valueNum = parseNum(value);

    if (!ticker || !filing_type || !period || !filing_date || !coupon_label) {
      stats.droppedRows += 1;
      continue;
    }

    if (!isIsoDate(period) || !isIsoDate(filing_date)) {
      stats.droppedRows += 1;
      continue;
    }

    // Some legacy rows carry only "Weighted Average Coupon" with no value column.
    // Keep those when pct_of_portfolio is parseable so WAC can be restored.
    if (valueNum === null && !(isWacOnlyRow && pctNum !== null)) {
      stats.droppedRows += 1;
      continue;
    }

    if (pct_of_portfolio && parseNum(pct_of_portfolio) === null) {
      stats.warnings.push(`Invalid pct_of_portfolio ignored for ${ticker} ${period} "${coupon_label}"`);
    }

    normalized.push({
      ticker,
      filing_type,
      period,
      filing_date,
      coupon_label,
      value,
      pct_of_portfolio,
    });
  }

  return { rows: normalized, stats };
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

/**
 * Parse a coupon label like "2.5%", "≥ 4.5%", "8.00%" → numeric rate in %.
 * Returns null for non-numeric labels like "Fixed-rate", "FLOAT", etc.
 */
function parseCouponRate(label: string): number | null {
  const m = label.match(/(\d[\d.]*)\s*%/);
  if (m) return parseFloat(m[1]);
  return null;
}

/**
 * Compute weighted average coupon from slices.
 * Skips slices whose labels aren't parseable (e.g. "Fixed-rate").
 * Returns null if fewer than 50% of portfolio weight is parseable.
 */
function computeWAC(slices: CouponSlice[]): number | null {
  let weightedSum = 0;
  let parsedWeight = 0;
  for (const s of slices) {
    const rate = parseCouponRate(s.label);
    if (rate === null) continue;
    weightedSum += rate * s.displayPct;
    parsedWeight += s.displayPct;
  }
  if (parsedWeight < 50) return null;
  return weightedSum / parsedWeight;
}

// ─── BVPS loading ─────────────────────────────────────────────────────────────

interface BvpsRow {
  ticker: string;
  period: string;
  bvps: string;
}

interface FundamentalsRow {
  ticker: string;
  period: string;
  leverage: string;
  financing_rate: string;
  net_interest_margin: string;
  swap_notional: string;
  unrestricted_cash: string;
  common_pref_equity_ratio: string;
  buybacks: string;
  issuance: string;
  preferred_issuance: string;
  common_equity: string;
  preferred_equity: string;
  total_liabilities: string;
}

interface FundamentalsSnapshot {
  leverage: number | null;
  financingRate: number | null;
  netInterestMargin: number | null;
  swapNotional: number | null;
  unrestrictedCash: number | null;
  commonPrefEquityRatio: number | null;
  buybacks: number | null;
  issuance: number | null;
  preferredIssuance: number | null;
  commonEquity: number | null;
  preferredEquity: number | null;
  totalLiabilities: number | null;
}

interface PreferredEquityXbrlRow {
  ticker: string;
  period: string;
  preferred_equity: string;
  common_equity: string;
  common_pref_equity_ratio: string;
}

interface PriceRow {
  ticker: string;
  period: string;
  close: string;
}

function normalizePercentMaybe(v: number | null): number | null {
  if (v == null) return null;
  // XBRL often stores rates as decimals (0.0323) instead of percent (3.23),
  // while HTML-extracted rates are commonly already percent values (e.g. 0.97%).
  return v > 0 && v <= 0.25 ? v * 100 : v;
}

function loadBvps(): Map<string, number> {
  const bvpsPath = path.join(process.cwd(), "data", "bvps.csv");
  if (!fs.existsSync(bvpsPath)) return new Map();

  // Strip comment lines before parsing
  const raw = fs.readFileSync(bvpsPath, "utf-8")
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("#"))
    .join("\n");

  const { data } = Papa.parse<BvpsRow>(raw, { header: true, skipEmptyLines: true });
  const map = new Map<string, number>();
  for (const row of data) {
    const ticker = row.ticker?.trim().toUpperCase();
    const period = row.period?.trim();
    const bvps = parseNum(row.bvps ?? "");
    if (ticker && period && bvps !== null && bvps > 0) {
      map.set(`${ticker}|${period}`, bvps);
    }
  }
  return map;
}

function loadFundamentals(): Map<string, FundamentalsSnapshot> {
  const fp = path.join(process.cwd(), "data", "fundamentals.csv");
  if (!fs.existsSync(fp)) return new Map();

  const raw = fs.readFileSync(fp, "utf-8")
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("#"))
    .join("\n");

  const { data } = Papa.parse<FundamentalsRow>(raw, { header: true, skipEmptyLines: true });
  const map = new Map<string, FundamentalsSnapshot>();
  for (const row of data) {
    const ticker = row.ticker?.trim().toUpperCase();
    const period = row.period?.trim();
    if (!ticker || !period) continue;
    map.set(`${ticker}|${period}`, {
      leverage: parseNum(row.leverage ?? ""),
      financingRate: normalizePercentMaybe(parseNum(row.financing_rate ?? "")),
      netInterestMargin: normalizePercentMaybe(parseNum(row.net_interest_margin ?? "")),
      swapNotional: parseNum(row.swap_notional ?? ""),
      unrestrictedCash: parseNum(row.unrestricted_cash ?? ""),
      commonPrefEquityRatio: parseNum(row.common_pref_equity_ratio ?? ""),
      buybacks: parseNum(row.buybacks ?? ""),
      issuance: parseNum(row.issuance ?? ""),
      preferredIssuance: parseNum(row.preferred_issuance ?? ""),
      commonEquity: parseNum(row.common_equity ?? ""),
      preferredEquity: parseNum(row.preferred_equity ?? ""),
      totalLiabilities: parseNum(row.total_liabilities ?? ""),
    });
  }
  return map;
}

function mergeFundamentalsFallback(
  base: Map<string, FundamentalsSnapshot>,
  fallback: Map<string, FundamentalsSnapshot>
): Map<string, FundamentalsSnapshot> {
  const merged = new Map(base);
  for (const [k, fb] of fallback.entries()) {
    const cur = merged.get(k) ?? {
      leverage: null,
      financingRate: null,
      netInterestMargin: null,
      swapNotional: null,
      unrestrictedCash: null,
      commonPrefEquityRatio: null,
      buybacks: null,
      issuance: null,
      preferredIssuance: null,
      commonEquity: null,
      preferredEquity: null,
      totalLiabilities: null,
    };
    merged.set(k, {
      leverage: cur.leverage ?? fb.leverage,
      financingRate: cur.financingRate ?? fb.financingRate,
      netInterestMargin: cur.netInterestMargin ?? fb.netInterestMargin,
      swapNotional: cur.swapNotional ?? fb.swapNotional,
      unrestrictedCash: cur.unrestrictedCash ?? fb.unrestrictedCash,
      commonPrefEquityRatio: cur.commonPrefEquityRatio ?? fb.commonPrefEquityRatio,
      buybacks: cur.buybacks ?? fb.buybacks,
      issuance: cur.issuance ?? fb.issuance,
      preferredIssuance: cur.preferredIssuance ?? fb.preferredIssuance,
      commonEquity: cur.commonEquity ?? fb.commonEquity,
      preferredEquity: cur.preferredEquity ?? fb.preferredEquity,
      totalLiabilities: cur.totalLiabilities ?? fb.totalLiabilities,
    });
  }
  return merged;
}

function loadFundamentalsHtmlFallback(): Map<string, FundamentalsSnapshot> {
  const fp = path.join(process.cwd(), "data", "fundamentals_html.csv");
  if (!fs.existsSync(fp)) return new Map();
  const raw = fs.readFileSync(fp, "utf-8");
  const { data } = Papa.parse<FundamentalsRow>(raw, { header: true, skipEmptyLines: true });
  const map = new Map<string, FundamentalsSnapshot>();
  for (const row of data) {
    const ticker = row.ticker?.trim().toUpperCase();
    const period = row.period?.trim();
    if (!ticker || !period) continue;
    map.set(`${ticker}|${period}`, {
      leverage: parseNum(row.leverage ?? ""),
      financingRate: normalizePercentMaybe(parseNum(row.financing_rate ?? "")),
      netInterestMargin: normalizePercentMaybe(parseNum(row.net_interest_margin ?? "")),
      swapNotional: parseNum(row.swap_notional ?? ""),
      unrestrictedCash: parseNum(row.unrestricted_cash ?? ""),
      commonPrefEquityRatio: parseNum(row.common_pref_equity_ratio ?? ""),
      buybacks: parseNum(row.buybacks ?? ""),
      issuance: parseNum(row.issuance ?? ""),
      preferredIssuance: parseNum(row.preferred_issuance ?? ""),
      commonEquity: parseNum(row.common_equity ?? ""),
      preferredEquity: parseNum(row.preferred_equity ?? ""),
      totalLiabilities: parseNum(row.total_liabilities ?? ""),
    });
  }
  return map;
}

type PreferredEquityFallbackSnapshot = {
  preferredEquity: number;
  commonEquity: number;
  commonPrefEquityRatio: number | null;
};

function loadPreferredEquityXbrlFallback(): Map<string, PreferredEquityFallbackSnapshot> {
  const fp = path.join(process.cwd(), "data", "preferred_equity_xbrl.csv");
  if (!fs.existsSync(fp)) return new Map();

  const raw = fs.readFileSync(fp, "utf-8")
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("#"))
    .join("\n");

  const { data } = Papa.parse<PreferredEquityXbrlRow>(raw, { header: true, skipEmptyLines: true });
  const map = new Map<string, PreferredEquityFallbackSnapshot>();
  for (const row of data) {
    const ticker = row.ticker?.trim().toUpperCase();
    const period = row.period?.trim();
    if (!ticker || !period) continue;

    const preferredEquity = parseNum(row.preferred_equity ?? "");
    const commonEquity = parseNum(row.common_equity ?? "");
    const ratio = parseNum(row.common_pref_equity_ratio ?? "");
    if (preferredEquity === null || commonEquity === null) continue;

    map.set(`${ticker}|${period}`, {
      preferredEquity,
      commonEquity,
      commonPrefEquityRatio: ratio,
    });
  }
  return map;
}

function loadPrices(): Map<string, number> {
  const fp = path.join(process.cwd(), "data", "prices.csv");
  if (!fs.existsSync(fp)) return new Map();
  const raw = fs.readFileSync(fp, "utf-8")
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("#"))
    .join("\n");
  const { data } = Papa.parse<PriceRow>(raw, { header: true, skipEmptyLines: true });
  const map = new Map<string, number>();
  for (const row of data) {
    const ticker = row.ticker?.trim().toUpperCase();
    const period = row.period?.trim();
    const close = parseNum(row.close ?? "");
    if (ticker && period && close !== null) {
      map.set(`${ticker}|${period}`, close);
    }
  }
  return map;
}

// ─── Rates loading ────────────────────────────────────────────────────────────

interface RatesRow {
  date: string;
  dgs10: string;
}

function loadRates(): RatePoint[] {
  const ratesPath = path.join(process.cwd(), "data", "rates.csv");
  if (!fs.existsSync(ratesPath)) return [];

  const raw = fs.readFileSync(ratesPath, "utf-8")
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("#"))
    .join("\n");

  const { data } = Papa.parse<RatesRow>(raw, { header: true, skipEmptyLines: true });
  const rates: RatePoint[] = [];
  for (const row of data) {
    const date = row.date?.trim();
    const dgs10 = parseNum(row.dgs10 ?? "");
    if (date && isIsoDate(date) && dgs10 !== null) {
      rates.push({ date, dgs10 });
    }
  }
  return rates.sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Ticker build ─────────────────────────────────────────────────────────────

function buildTickerData(
  ticker: string,
  rows: RawRow[],
  bvpsMap: Map<string, number>,
  fundamentalsMap: Map<string, FundamentalsSnapshot>,
  priceMap: Map<string, number>,
  preferredEquityXbrlMap: Map<string, PreferredEquityFallbackSnapshot>
): TickerData {
  // Group by period
  const byPeriod = new Map<string, RawRow[]>();
  for (const row of rows) {
    const arr = byPeriod.get(row.period) ?? [];
    arr.push(row);
    byPeriod.set(row.period, arr);
  }

  // Determine data mode
  const dataMode: DataMode = PCT_VALUE_TICKERS.has(ticker) ? "pct" : "value";

  let hasShorts = false;
  const allLabelSet = new Set<string>();
  const periods: PeriodSnapshot[] = [];

  for (const [period, periodRows] of byPeriod) {
    const wacOverrideRow = periodRows.find(
      (r) => /weighted\s+average\s+coupon/i.test(r.coupon_label) && parseNum(r.pct_of_portfolio ?? "") !== null
    );
    const wacOverride = wacOverrideRow ? parseNum(wacOverrideRow.pct_of_portfolio ?? "") : null;

    // Do not treat WAC-only helper rows as distribution slices.
    const sliceRows = periodRows.filter((r) => !/weighted\s+average\s+coupon/i.test(r.coupon_label));

    // Filter negatives (ORC short TBA positions)
    const positiveRows = sliceRows.filter((r) => {
      const v = parseNum(r.value);
      if (v !== null && v < 0) { hasShorts = true; return false; }
      return true;
    });

    if (positiveRows.length === 0) {
      // Keep the period if we at least have an explicit WAC row.
      if (wacOverride === null) continue;
    }

    let slices: CouponSlice[];

    if (positiveRows.length === 0 && wacOverride !== null) {
      slices = [{ label: "Weighted Average Coupon", displayPct: 100, rawValue: null }];
      allLabelSet.add("Weighted Average Coupon");
    } else if (dataMode === "pct") {
      const vals = positiveRows.map((r) => parseNum(r.value) ?? 0);
      const total = vals.reduce((s, v) => s + v, 0);
      const valuesLookLikePct = total > 0 && total <= 150;
      slices = positiveRows.map((r, i) => {
        const pct = valuesLookLikePct ? vals[i] : (total > 0 ? (vals[i] / total) * 100 : 0);
        allLabelSet.add(r.coupon_label);
        return { label: r.coupon_label, displayPct: pct, rawValue: valuesLookLikePct ? null : vals[i] };
      });
    } else {
      const values = positiveRows.map((r) => parseNum(r.value) ?? 0);
      const total = values.reduce((s, v) => s + v, 0);
      slices = positiveRows.map((r, i) => {
        const rawValue = values[i];
        const displayPct = total > 0 ? (rawValue / total) * 100 : 0;
        allLabelSet.add(r.coupon_label);
        return { label: r.coupon_label, displayPct, rawValue };
      });
    }

    const filing = positiveRows[0] ?? periodRows[0];
    const pctSum = slices.reduce((sum, slice) => sum + slice.displayPct, 0);
    if (slices.length > 0 && Math.abs(100 - pctSum) > 2) {
      throw new Error(`Pct sum sanity check failed for ${ticker} ${period}: got ${pctSum.toFixed(3)}`);
    }

    const wac = wacOverride ?? computeWAC(slices) ?? null;
    const bvps = bvpsMap.get(`${ticker}|${period}`) ?? null;
    const fundamentals = fundamentalsMap.get(`${ticker}|${period}`);
    const marketPrice = priceMap.get(`${ticker}|${period}`) ?? null;
    const priceToBook = marketPrice !== null && bvps !== null && bvps > 0 ? marketPrice / bvps : null;
    const xbrlFallback = preferredEquityXbrlMap.get(`${ticker}|${period}`);

    const preferredEquity = fundamentals?.preferredEquity ?? xbrlFallback?.preferredEquity ?? null;
    const commonEquity = fundamentals?.commonEquity ?? xbrlFallback?.commonEquity ?? null;
    const commonPrefEquityRatio = fundamentals?.commonPrefEquityRatio ?? xbrlFallback?.commonPrefEquityRatio ?? null;

    periods.push({
      period,
      filing_date: filing.filing_date,
      filing_type: filing.filing_type,
      slices,
      wac,
      bvps,
      leverage: fundamentals?.leverage ?? null,
      financingRate: fundamentals?.financingRate ?? null,
      netInterestMargin: fundamentals?.netInterestMargin ?? null,
      swapNotional: fundamentals?.swapNotional ?? null,
      unrestrictedCash: fundamentals?.unrestrictedCash ?? null,
      commonPrefEquityRatio,
      buybacks: fundamentals?.buybacks ?? null,
      issuance: fundamentals?.issuance ?? null,
      preferredIssuance: fundamentals?.preferredIssuance ?? null,
      marketPrice,
      priceToBook,
      commonEquity,
      preferredEquity,
      totalLiabilities: fundamentals?.totalLiabilities ?? null,
    });
  }

  // Sort periods ascending
  periods.sort((a, b) => a.period.localeCompare(b.period));

  // Gap-fill missing WAC when coupon buckets exist but don't include parseable
  // '%' labels (extractor false-negatives). Interpolate between known WAC
  // values within the same ticker so the UI has continuous WAC time series.
  const knownWac: Array<{ idx: number; wac: number }> = [];
  periods.forEach((p, idx) => {
    if (p.wac !== null) knownWac.push({ idx, wac: p.wac });
  });
  if (knownWac.length > 0) {
    // Fill before first known
    for (let i = 0; i < knownWac[0].idx; i++) periods[i].wac = knownWac[0].wac;

    // Fill gaps between known points
    for (let k = 0; k < knownWac.length - 1; k++) {
      const a = knownWac[k];
      const b = knownWac[k + 1];
      const span = b.idx - a.idx;
      if (span <= 0) continue;
      for (let i = a.idx + 1; i < b.idx; i++) {
        if (periods[i].wac !== null) continue;
        const t = (i - a.idx) / span;
        periods[i].wac = a.wac + (b.wac - a.wac) * t;
      }
    }

    // Fill after last known
    const last = knownWac[knownWac.length - 1];
    for (let i = last.idx + 1; i < periods.length; i++) periods[i].wac = last.wac;
  }

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
  const csvPath = path.join(process.cwd(), "data", "mreit_master.csv");
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found at ${csvPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(csvPath, "utf-8");
  const { data } = Papa.parse<RawRow>(raw, { header: true, skipEmptyLines: true });
  const { rows: normalizedRows, stats } = normalizeRawRows(data);

  const bvpsMap = loadBvps();
  const fundamentalsMap = mergeFundamentalsFallback(loadFundamentals(), loadFundamentalsHtmlFallback());
  const preferredEquityXbrlMap = loadPreferredEquityXbrlFallback();
  const priceMap = loadPrices();
  const rates = loadRates();

  console.log(
    `Loaded ${bvpsMap.size} BVPS records, ${fundamentalsMap.size} fundamentals rows, ${preferredEquityXbrlMap.size} preferred equity fallback rows, ${priceMap.size} prices, ${rates.length} rate points`
  );

  // Group by ticker
  const byTicker = new Map<string, RawRow[]>();
  for (const row of normalizedRows) {
    const arr = byTicker.get(row.ticker) ?? [];
    arr.push(row);
    byTicker.set(row.ticker, arr);
  }

  const tickers: TickerData[] = [];
  for (const [ticker, rows] of byTicker) {
    const td = buildTickerData(ticker, rows, bvpsMap, fundamentalsMap, priceMap, preferredEquityXbrlMap);
    if (td.periods.length > 0) tickers.push(td);
  }

  // Sort tickers: by number of periods desc, then alphabetically
  tickers.sort((a, b) => {
    if (b.periods.length !== a.periods.length) return b.periods.length - a.periods.length;
    return a.ticker.localeCompare(b.ticker);
  });

  const siteData: SiteData = {
    tickers,
    rates,
    generatedAt: new Date().toISOString(),
  };

  const outPath = path.join(process.cwd(), "data", "mreit.json");
  fs.writeFileSync(outPath, JSON.stringify(siteData, null, 2));
  console.log(`✓ Built ${tickers.length} tickers → ${outPath}`);
  if (stats.droppedRows > 0) {
    console.warn(`⚠ Dropped ${stats.droppedRows} malformed row(s) while building dataset`);
  }
  stats.warnings.forEach((w) => console.warn(`⚠ ${w}`));
  tickers.forEach((t) => {
    const wacValues = t.periods.filter((p) => p.wac !== null).length;
    const bvpsValues = t.periods.filter((p) => p.bvps !== null).length;
    console.log(
      `  ${t.ticker}: ${t.periods.length} periods, mode=${t.dataMode}` +
      `${t.hasShorts ? " [has shorts]" : ""}` +
      `, WAC=${wacValues}/${t.periods.length}` +
      `, BVPS=${bvpsValues}/${t.periods.length}`
    );
  });
}

main();
