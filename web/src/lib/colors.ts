// Vivid colors for dark 90s background
const PALETTE = [
  "#00ff88", // mint green
  "#ff4444", // red
  "#44aaff", // sky blue
  "#ffff00", // yellow
  "#ff8800", // orange
  "#ff44ff", // magenta
  "#00ffff", // cyan
  "#ff4488", // hot pink
  "#88ff00", // lime
  "#ffaa44", // amber
  "#8888ff", // periwinkle
  "#ff0088", // deep pink
  "#44ffcc", // aqua
  "#ffcc00", // gold
  "#aa88ff", // lavender
  "#00ff44", // green
  "#ff6644", // coral
  "#4488ff", // blue
];

export function buildColorMap(labels: string[]): Record<string, string> {
  return Object.fromEntries(
    labels.map((label, i) => [label, PALETTE[i % PALETTE.length]])
  );
}
