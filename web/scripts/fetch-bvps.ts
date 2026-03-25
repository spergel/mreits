/**
 * fetch-bvps.ts
 *
 * Fetches book value per common share from SEC EDGAR XBRL API for each
 * ticker in mreit_master.csv and writes the results to data/bvps.csv.
 *
 * Usage:
 *   tsx scripts/fetch-bvps.ts
 *
 * Per SEC guidelines, the User-Agent header must identify the requester.
 * Update UA_CONTACT below with your email address.
 */

import fs from "fs";
import path from "path";
import Papa from "papaparse";

const UA_CONTACT = "mreit-site contact@example.com";

const SEC_HEADERS = {
  "User-Agent": UA_CONTACT,
  Accept: "application/json",
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: SEC_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// ─── EDGAR types ────────────────────────────────────────────────────────────

interface XbrlFact {
  end: string;
  val: number;
  form: string;
  filed: string;
  start?: string;
}

interface XbrlConcept {
  units?: {
    USD?: XbrlFact[];
    shares?: XbrlFact[];
  };
}

interface CompanyFacts {
  facts?: {
    "us-gaap"?: Record<string, XbrlConcept>;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FILING_FORMS = new Set(["10-Q", "10-K", "10-Q/A", "10-K/A"]);

/** For balance-sheet (instantaneous) facts: pick latest filing per period-end date. */
function instantByPeriod(facts: XbrlFact[]): Map<string, number> {
  const map = new Map<string, { val: number; filed: string }>();
  for (const f of facts) {
    if (f.start) continue; // skip flow/period facts
    if (!FILING_FORMS.has(f.form)) continue;
    const ex = map.get(f.end);
    if (!ex || f.filed > ex.filed) map.set(f.end, { val: f.val, filed: f.filed });
  }
  return new Map([...map.entries()].map(([k, v]) => [k, v.val]));
}

function pickConcept(
  gaap: Record<string, XbrlConcept>,
  ...names: string[]
): XbrlFact[] {
  for (const name of names) {
    const facts =
      gaap[name]?.units?.USD ?? gaap[name]?.units?.shares;
    if (facts?.length) return facts;
  }
  return [];
}

/** Merge USD facts from multiple concepts (preferred stock tags are inconsistent across filers). */
function mergeConceptUsdFacts(
  gaap: Record<string, XbrlConcept>,
  names: string[]
): XbrlFact[] {
  const out: XbrlFact[] = [];
  for (const name of names) {
    const facts = gaap[name]?.units?.USD;
    if (facts?.length) out.push(...facts);
  }
  return out;
}

/** Merge USD facts from multiple equity tags so periods only reported on NCI-inclusive equity are not dropped. */
function mergeEquityUsdFacts(
  gaap: Record<string, XbrlConcept>,
  names: string[]
): XbrlFact[] {
  const out: XbrlFact[] = [];
  for (const name of names) {
    const facts = gaap[name]?.units?.USD;
    if (facts?.length) out.push(...facts);
  }
  return out;
}

// ─── Core fetch ──────────────────────────────────────────────────────────────

async function fetchBvpsForCik(
  ticker: string,
  cik: string
): Promise<Array<{ period: string; bvps: number }>> {
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
  let data: CompanyFacts;
  try {
    data = (await fetchJson(url)) as CompanyFacts;
  } catch (e) {
    console.warn(`    [WARN] ${ticker}: ${(e as Error).message}`);
    return [];
  }

  const gaap = data.facts?.["us-gaap"];
  if (!gaap) return [];

  // Stockholders' equity (total) — merge tags; some filers only post including-NCI for recent periods
  const equityFacts = mergeEquityUsdFacts(gaap, [
    "StockholdersEquity",
    "StockholdersEquityAttributableToParent",
    "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
  ]);
  const equity = instantByPeriod(equityFacts);

  // Preferred stock value to subtract (concepts vary widely by filer)
  // IMPORTANT: many filers report PreferredStockValue as *par value* (tiny) rather than
  // economic carrying value. Prefer liquidation preference when available.
  const preferredFactsLiquidation = mergeConceptUsdFacts(gaap, [
    "PreferredStockLiquidationPreferenceValue",
    "PreferredStockLiquidationPreference",
  ]);
  const preferredFactsCarrying = mergeConceptUsdFacts(gaap, [
    "RedeemablePreferredStockCarryingAmount",
    "TemporaryEquityCarryingAmount",
  ]);
  const preferredFactsPar = mergeConceptUsdFacts(gaap, [
    "PreferredStockValue",
    "PreferredStockValueOutstanding",
  ]);

  const preferred =
    preferredFactsLiquidation.length > 0
      ? instantByPeriod(preferredFactsLiquidation)
      : preferredFactsCarrying.length > 0
        ? instantByPeriod(preferredFactsCarrying)
        : instantByPeriod(preferredFactsPar);

  // Common shares outstanding (units: shares)
  const sharesFacts: XbrlFact[] = (() => {
    for (const name of [
      "CommonStockSharesOutstanding",
      "CommonStockSharesIssued",
    ]) {
      const f = gaap[name]?.units?.shares;
      if (f?.length) return f;
    }
    return [];
  })();
  const shares = instantByPeriod(sharesFacts);

  // Optional fallback from parsed XBRL instance XML.
  // This is needed when SEC companyfacts is missing preferred liquidation
  // preference for later periods.
  const prefFallback = loadPreferredLiquidationPreferenceForTicker(ticker);

  const results: Array<{ period: string; bvps: number }> = [];

  for (const [period, eq] of equity) {
    const sh = shares.get(period);
    if (!sh || sh === 0) continue;
    // Prefer XBRL instance-derived preferred liquidation preference when
    // available; it is more reliable than some missing/par-value
    // companyfacts series (e.g. MFA).
    const pref = prefFallback.get(period) ?? preferred.get(period) ?? 0;
    const commonEquity = eq - pref;
    const bvps = commonEquity / sh;
    // Sanity: book value should be between $0 and $1000/share for mREITs
    if (bvps > 0 && bvps < 1000) {
      results.push({ period, bvps: Math.round(bvps * 100) / 100 });
    }
  }

  return results.sort((a, b) => a.period.localeCompare(b.period));
}

function loadPreferredLiquidationPreferenceForTicker(ticker: string): Map<string, number> {
  const out = new Map<string, number>();
  const fp = path.join(process.cwd(), "data", "preferred_liq.csv");
  if (!fs.existsSync(fp)) return out;

  const raw = fs
    .readFileSync(fp, "utf-8")
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("#"))
    .join("\n");

  const { data } = Papa.parse<{ ticker: string; period: string; preferred_liquidation_preference: string }>(raw, {
    header: true,
    skipEmptyLines: true,
  });

  const t = ticker.toUpperCase();
  for (const row of data) {
    if ((row.ticker ?? "").trim().toUpperCase() !== t) continue;
    const period = (row.period ?? "").trim();
    const valRaw = row.preferred_liquidation_preference ?? "";
    const val = parseFloat(valRaw);
    if (!period || Number.isNaN(val)) continue;
    out.set(period, val);
  }
  return out;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const csvPath = path.join(process.cwd(), "data", "mreit_master.csv");
  if (!fs.existsSync(csvPath)) {
    console.error(`mreit_master.csv not found at ${csvPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(csvPath, "utf-8");
  const { data } = Papa.parse<{ ticker: string }>(raw, {
    header: true,
    skipEmptyLines: true,
  });
  const tickers = [
    ...new Set(
      data
        .map((r) => r.ticker?.trim().toUpperCase())
        .filter(Boolean) as string[]
    ),
  ];
  console.log(`Tickers to fetch: ${tickers.join(", ")}`);

  // Load SEC company-ticker → CIK mapping
  console.log("Loading SEC ticker→CIK map...");
  const tickerMap = (await fetchJson(
    "https://www.sec.gov/files/company_tickers.json"
  )) as Record<string, { cik_str: number | string; ticker: string }>;

  const tickerToCik = new Map<string, string>();
  for (const entry of Object.values(tickerMap)) {
    tickerToCik.set(
      entry.ticker.toUpperCase(),
      String(entry.cik_str).padStart(10, "0")
    );
  }

  const rows: Array<{ ticker: string; period: string; bvps: number }> = [];

  for (const ticker of tickers) {
    const cik = tickerToCik.get(ticker);
    if (!cik) {
      console.warn(`  [SKIP] ${ticker}: not found in SEC ticker map`);
      continue;
    }
    console.log(`  ${ticker} (CIK ${cik})...`);
    await sleep(200); // stay well under SEC's 10 req/s limit
    const bvpsData = await fetchBvpsForCik(ticker, cik);
    for (const d of bvpsData) rows.push({ ticker, ...d });
    console.log(`    → ${bvpsData.length} period(s)`);
  }

  // Comment header stripped by unparse — prepend manually
  const header = "# Book value per common share — sourced from SEC EDGAR XBRL\n";
  const csv = header + Papa.unparse(rows, { columns: ["ticker", "period", "bvps"] });
  const outPath = path.join(process.cwd(), "data", "bvps.csv");
  fs.writeFileSync(outPath, csv);
  console.log(`\n✓ Wrote ${rows.length} BVPS records to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
