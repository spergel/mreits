export type DataMode = "pct" | "value";

export interface CouponSlice {
  label: string;
  displayPct: number; // always 0-100
  rawValue: number | null; // dollar value in thousands, null for pct-only
}

export interface PeriodSnapshot {
  period: string; // "YYYY-MM-DD"
  filing_date: string;
  filing_type: string;
  slices: CouponSlice[];
  wac: number | null;  // weighted average coupon, in percent (e.g. 3.25)
  bvps: number | null; // book value per common share, in dollars
  leverage: number | null; // Debt/Equity ratio (x)
  financingRate: number | null; // weighted average financing/cost of funds (%)
  netInterestMargin: number | null; // net interest margin/spread (%)
  swapNotional: number | null; // interest rate swap notional ($M, as reported)
  unrestrictedCash: number | null; // cash and cash equivalents (whole USD, SEC)
  commonPrefEquityRatio: number | null; // common equity / preferred equity (x)
  buybacks: number | null; // common stock repurchases ($M, period flow)
  issuance: number | null; // common stock issuance proceeds ($M, period flow)
  preferredIssuance: number | null; // preferred stock issuance proceeds ($M, period flow)
  marketPrice: number | null; // quarter-end close ($)
  priceToBook: number | null; // market price / BVPS (x)
  commonEquity: number | null; // common equity ($M)
  preferredEquity: number | null; // preferred equity ($M)
  totalLiabilities: number | null; // liabilities as debt proxy ($M)
}

export interface TickerData {
  ticker: string;
  dataMode: DataMode;
  hasShorts: boolean;
  periods: PeriodSnapshot[]; // sorted ascending
  allLabels: string[]; // stable union for color mapping
  latestPeriod: PeriodSnapshot;
}

export interface RatePoint {
  date: string;   // "YYYY-MM-DD" end of quarter
  dgs10: number;  // 10Y CMT yield in percent
}

export interface SiteData {
  tickers: TickerData[];
  rates: RatePoint[];
  generatedAt: string;
}
