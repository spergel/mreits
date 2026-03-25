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
    pure?: XbrlFact[];
    shares?: XbrlFact[];
  };
}

interface CompanyFacts {
  facts?: {
    "us-gaap"?: Record<string, XbrlConcept>;
  };
}

interface FundamentalsRow {
  ticker: string;
  period: string;
  leverage: number | null;
  financing_rate: number | null;
  net_interest_margin: number | null;
  swap_notional: number | null;
  unrestricted_cash: number | null;
  common_pref_equity_ratio: number | null;
  buybacks: number | null;
  issuance: number | null;
  preferred_issuance: number | null;
  common_equity: number | null;
  preferred_equity: number | null;
  total_liabilities: number | null;
}

const FILING_FORMS = new Set(["10-Q", "10-K", "10-Q/A", "10-K/A"]);

function parsePeriodEndMap(facts: XbrlFact[]): Map<string, number> {
  const map = new Map<string, { val: number; filed: string }>();
  for (const f of facts) {
    if (!FILING_FORMS.has(f.form)) continue;
    const ex = map.get(f.end);
    if (!ex || f.filed > ex.filed) {
      map.set(f.end, { val: f.val, filed: f.filed });
    }
  }
  return new Map([...map.entries()].map(([k, v]) => [k, v.val]));
}

function pickConceptFacts(
  gaap: Record<string, XbrlConcept>,
  unit: "USD" | "pure",
  names: string[]
): XbrlFact[] {
  for (const name of names) {
    const facts = gaap[name]?.units?.[unit];
    if (facts?.length) return facts;
  }
  return [];
}

/** Merge XBRL facts from multiple concepts (e.g. equity tags) so sparse newer filings are not hidden behind an older tag that still has facts. */
function mergeConceptFacts(
  gaap: Record<string, XbrlConcept>,
  unit: "USD" | "pure",
  names: string[]
): XbrlFact[] {
  const out: XbrlFact[] = [];
  for (const name of names) {
    const facts = gaap[name]?.units?.[unit];
    if (facts?.length) out.push(...facts);
  }
  return out;
}

async function fetchFundamentalsForCik(ticker: string, cik: string): Promise<FundamentalsRow[]> {
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

  const leverage = parsePeriodEndMap(
    pickConceptFacts(gaap, "pure", ["DebtToEquityRatio", "DebtToEquity"])
  );
  /** Repo balance / total equity — common mREIT economic leverage when GAAP omits DebtToEquityRatio. */
  const repoAgreements = parsePeriodEndMap(
    pickConceptFacts(gaap, "USD", ["SecuritiesSoldUnderAgreementsToRepurchase"])
  );
  const financingRate = parsePeriodEndMap(
    pickConceptFacts(gaap, "pure", [
      "DebtWeightedAverageInterestRate",
      "ShortTermDebtWeightedAverageInterestRate",
      "ShortTermDebtWeightedAverageInterestRateOverTime",
      "WeightedAverageInterestRate",
      "InterestRate",
      "CostOfFunds",
    ])
  );
  const netInterestMargin = parsePeriodEndMap(
    pickConceptFacts(gaap, "pure", ["NetInterestMargin", "NetInterestSpread"])
  );
  const swapNotional = parsePeriodEndMap(
    pickConceptFacts(gaap, "USD", [
      "NotionalAmountOfInterestRateDerivatives",
      "NotionalAmountOfInterestRateCashFlowHedgeDerivatives",
      "NotionalAmountOfInterestRateDerivativeInstrumentsNotDesignatedAsHedgingInstruments",
      "InterestRateSwapNotionalAmount",
      "NotionalAmountOfDerivatives",
      "DerivativeLiabilityNotionalAmount",
      "DerivativeNotionalAmount",
    ])
  );
  const unrestrictedCash = parsePeriodEndMap(
    pickConceptFacts(gaap, "USD", ["CashAndCashEquivalentsAtCarryingValue"])
  );
  const totalEquity = parsePeriodEndMap(
    mergeConceptFacts(gaap, "USD", [
      "StockholdersEquity",
      "StockholdersEquityAttributableToParent",
      "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
    ])
  );
  const preferredFacts = mergeConceptFacts(gaap, "USD", [
    "PreferredStockValue",
    "PreferredStockValueOutstanding",
    "TemporaryEquityCarryingAmount",
    "RedeemablePreferredStockCarryingAmount",
  ]);
  const preferredEquity = parsePeriodEndMap(preferredFacts);
  const hasPreferredConceptFacts = preferredFacts.length > 0;
  const totalLiabilities = parsePeriodEndMap(
    pickConceptFacts(gaap, "USD", ["Liabilities", "LiabilitiesCurrentAndNoncurrent"])
  );
  const buybacks = parsePeriodEndMap(
    pickConceptFacts(gaap, "USD", [
      "PaymentsForRepurchaseOfCommonStock",
      "PaymentsForRepurchaseOfEquity",
    ])
  );
  const issuance = parsePeriodEndMap(
    pickConceptFacts(gaap, "USD", [
      "ProceedsFromIssuanceOfCommonStock",
      "ProceedsFromIssuanceOfSharesUnderIncentiveAndShareBasedCompensationPlansIncludingStockOptions",
      "ProceedsFromIssuanceOfSharesUnderIncentiveAndShareBasedCompensationPlansIncludingEmployeeStockPurchasePlans",
    ])
  );

  const preferredIssuance = parsePeriodEndMap(
    pickConceptFacts(gaap, "USD", [
      "ProceedsFromIssuanceOfPreferredStockAndPreferenceStock",
      "ProceedsFromIssuanceOfRedeemablePreferredStock",
      "ProceedsFromIssuanceOfPreferenceStock",
      "ProceedsFromIssuanceOfPreferredStock",
    ])
  );

  const periods = new Set<string>([
    ...leverage.keys(),
    ...repoAgreements.keys(),
    ...financingRate.keys(),
    ...netInterestMargin.keys(),
    ...swapNotional.keys(),
    ...unrestrictedCash.keys(),
    ...totalEquity.keys(),
    ...preferredEquity.keys(),
    ...buybacks.keys(),
    ...issuance.keys(),
    ...preferredIssuance.keys(),
    ...totalLiabilities.keys(),
  ]);

  const rows: FundamentalsRow[] = [];
  for (const period of [...periods].sort()) {
    const eq = totalEquity.get(period) ?? null;
    const prefRaw = preferredEquity.get(period);
    // If issuer has no preferred concepts/facts at all, treat preferred as zero.
    // This preserves common equity for common-only issuers (e.g., REFI) while
    // avoiding zero-fill for issuers that do report preferred capital.
    const pref = prefRaw ?? (eq !== null && !hasPreferredConceptFacts ? 0 : null);
    const commonPrefEquityRatio =
      eq !== null && pref !== null && pref > 0 ? (eq - pref) / pref : null;
    const repo = repoAgreements.get(period);
    const liab = totalLiabilities.get(period);
    let lev: number | null = leverage.get(period) ?? null;
    if (lev === null && repo !== undefined && eq !== null && eq > 0 && repo > 0) {
      lev = repo / eq;
    }
    if (lev === null && liab !== undefined && eq !== null && eq > 0 && liab > 0) {
      const r = liab / eq;
      if (r >= 0.2 && r <= 45) {
        lev = r;
      }
    }
    rows.push({
      ticker,
      period,
      leverage: lev,
      financing_rate: financingRate.get(period) ?? null,
      net_interest_margin: netInterestMargin.get(period) ?? null,
      swap_notional: swapNotional.get(period) ?? null,
      unrestricted_cash: unrestrictedCash.get(period) ?? null,
      common_pref_equity_ratio: commonPrefEquityRatio,
      buybacks: buybacks.get(period) ?? null,
      issuance: issuance.get(period) ?? null,
      preferred_issuance: preferredIssuance.get(period) ?? null,
      common_equity: eq !== null && pref !== null ? eq - pref : null,
      preferred_equity: pref,
      total_liabilities: totalLiabilities.get(period) ?? null,
    });
  }

  return rows;
}

async function main() {
  const csvPath = path.join(process.cwd(), "data", "mreit_master.csv");
  const raw = fs.readFileSync(csvPath, "utf-8");
  const { data } = Papa.parse<{ ticker: string }>(raw, { header: true, skipEmptyLines: true });
  const tickers = [...new Set(data.map((r) => r.ticker?.trim().toUpperCase()).filter(Boolean) as string[])];

  console.log(`Tickers to fetch fundamentals: ${tickers.join(", ")}`);

  const tickerMap = (await fetchJson(
    "https://www.sec.gov/files/company_tickers.json"
  )) as Record<string, { cik_str: number | string; ticker: string }>;

  const tickerToCik = new Map<string, string>();
  for (const entry of Object.values(tickerMap)) {
    tickerToCik.set(entry.ticker.toUpperCase(), String(entry.cik_str).padStart(10, "0"));
  }

  const rows: FundamentalsRow[] = [];
  for (const ticker of tickers) {
    const cik = tickerToCik.get(ticker);
    if (!cik) {
      console.warn(`  [SKIP] ${ticker}: no CIK`);
      continue;
    }
    console.log(`  ${ticker} (CIK ${cik})...`);
    await sleep(200);
    const frows = await fetchFundamentalsForCik(ticker, cik);
    rows.push(...frows);
    console.log(`    → ${frows.length} period(s)`);
  }

  const header = "# Selected fundamentals from SEC EDGAR XBRL (sparse by ticker)\n";
  const csv = header + Papa.unparse(rows, {
    columns: [
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
  });
  const outPath = path.join(process.cwd(), "data", "fundamentals.csv");
  fs.writeFileSync(outPath, csv);
  console.log(`\n✓ Wrote ${rows.length} fundamentals rows to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
