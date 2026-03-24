import { buildColorMap } from "@/lib/colors";
import type { CouponSlice } from "@/types/mreit";

interface Props {
  slices: CouponSlice[];
  allLabels: string[];
}

export default function MiniBar({ slices, allLabels }: Props) {
  const colorMap = buildColorMap(allLabels);
  return (
    <div style={{
      display: "flex",
      height: "13px",
      width: "100%",
      border: "1px solid #006600",
      overflow: "hidden",
      boxSizing: "border-box",
    }}>
      {slices.map((slice) => (
        <div
          key={slice.label}
          style={{
            width: `${slice.displayPct}%`,
            background: colorMap[slice.label],
            flexShrink: 0,
          }}
          title={`${slice.label}: ${slice.displayPct.toFixed(1)}%`}
        />
      ))}
    </div>
  );
}
