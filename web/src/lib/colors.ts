// Excel 95-era chart color palette
const PALETTE = [
  "#003366", // dark navy
  "#990000", // dark red
  "#336600", // forest green
  "#663399", // purple
  "#cc6600", // amber
  "#006666", // dark teal
  "#993300", // rust
  "#003399", // royal blue
  "#996633", // brown
  "#336633", // dark green
  "#993366", // dark rose
  "#006699", // steel blue
  "#cc3300", // red-orange
  "#669900", // olive
  "#6600cc", // violet
  "#cc9900", // gold
  "#009966", // emerald
  "#cc0066", // magenta
];

export function buildColorMap(labels: string[]): Record<string, string> {
  return Object.fromEntries(
    labels.map((label, i) => [label, PALETTE[i % PALETTE.length]])
  );
}
