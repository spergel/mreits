export function formatPeriod(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00Z");
  const quarter = Math.ceil((d.getUTCMonth() + 1) / 3);
  return `Q${quarter} ${d.getUTCFullYear()}`;
}

/**
 * Coupon slice `rawValue` and similar fields are in **thousands** of dollars.
 * (e.g. 655_356 → ~$655M.)
 */
export function formatLargeValue(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}B`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}M`;
  return `$${v.toFixed(0)}K`;
}

/**
 * SEC XBRL / fundamentals store cash and equity balances in **whole USD**.
 */
export function formatUsdDollars(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(0)}M`;
  if (abs >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export function formatPct(v: number): string {
  return v.toFixed(1) + "%";
}

export function formatWAC(v: number | null | undefined): string {
  if (v == null) return "—";
  const pct = Math.abs(v) <= 1 ? v * 100 : v;
  return pct.toFixed(2) + "%";
}

export function formatBVPS(v: number | null | undefined): string {
  if (v == null) return "—";
  return "$" + v.toFixed(2);
}

export function formatMultiple(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toFixed(2) + "x";
}
