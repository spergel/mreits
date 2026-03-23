import { buildColorMap } from "@/lib/colors";
import type { CouponSlice } from "@/types/mreit";

interface Props {
  slices: CouponSlice[];
  allLabels: string[];
}

export default function MiniBar({ slices, allLabels }: Props) {
  const colorMap = buildColorMap(allLabels);
  return (
    <div className="flex h-2.5 w-full rounded overflow-hidden gap-px">
      {slices.map((slice) => (
        <div
          key={slice.label}
          style={{ width: `${slice.displayPct}%`, background: colorMap[slice.label] }}
          title={`${slice.label}: ${slice.displayPct.toFixed(1)}%`}
        />
      ))}
    </div>
  );
}
