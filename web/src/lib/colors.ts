const PALETTE = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#6366f1",
  "#14b8a6", "#a855f7", "#fb923c", "#22c55e", "#e11d48",
  "#0ea5e9", "#d97706", "#16a34a",
];

export function buildColorMap(labels: string[]): Record<string, string> {
  return Object.fromEntries(
    labels.map((label, i) => [label, PALETTE[i % PALETTE.length]])
  );
}
