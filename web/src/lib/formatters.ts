export function formatPeriod(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00Z");
  const quarter = Math.ceil((d.getUTCMonth() + 1) / 3);
  return `Q${quarter} ${d.getUTCFullYear()}`;
}

export function formatLargeValue(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}B`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}M`;
  return `$${v.toFixed(0)}K`;
}

export function formatPct(v: number): string {
  return v.toFixed(1) + "%";
}
