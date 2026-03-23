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
}

export interface TickerData {
  ticker: string;
  dataMode: DataMode;
  hasShorts: boolean;
  periods: PeriodSnapshot[]; // sorted ascending
  allLabels: string[]; // stable union for color mapping
  latestPeriod: PeriodSnapshot;
}

export interface SiteData {
  tickers: TickerData[];
  generatedAt: string;
}
