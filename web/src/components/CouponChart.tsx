"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { PeriodSnapshot } from "@/types/mreit";
import { buildColorMap } from "@/lib/colors";
import { formatPeriod, formatLargeValue, formatPct } from "@/lib/formatters";

interface Props {
  periods: PeriodSnapshot[];
  allLabels: string[];
  dataMode: "pct" | "value";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label, dataMode }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm shadow-xl max-w-xs">
      <p className="font-semibold text-white mb-2">{label}</p>
      {[...payload].reverse().map((entry: { color: string; name: string; value: number; payload: Record<string, number> }) => {
        const rawKey = `__raw_${entry.name}`;
        const rawVal = entry.payload[rawKey];
        return (
          <div key={entry.name} className="flex justify-between gap-4 text-slate-300">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: entry.color }} />
              <span className="truncate max-w-[140px]">{entry.name}</span>
            </span>
            <span className="font-mono text-white">
              {formatPct(entry.value)}
              {dataMode === "value" && rawVal != null && (
                <span className="text-slate-400 ml-1">({formatLargeValue(rawVal)})</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function CouponChart({ periods, allLabels, dataMode }: Props) {
  const colorMap = buildColorMap(allLabels);

  const chartData = periods.map((p) => {
    const row: Record<string, number | string> = { period: formatPeriod(p.period) };
    for (const slice of p.slices) {
      row[slice.label] = parseFloat(slice.displayPct.toFixed(2));
      if (dataMode === "value" && slice.rawValue != null) {
        row[`__raw_${slice.label}`] = slice.rawValue;
      }
    }
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={380}>
      <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <XAxis
          dataKey="period"
          tick={{ fill: "#94a3b8", fontSize: 12 }}
          axisLine={{ stroke: "#334155" }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => `${v}%`}
          tick={{ fill: "#94a3b8", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          domain={[0, 100]}
          width={44}
        />
        <Tooltip content={<CustomTooltip dataMode={dataMode} />} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
        <Legend
          wrapperStyle={{ fontSize: "12px", paddingTop: "16px" }}
          formatter={(value) => <span style={{ color: "#cbd5e1" }}>{value}</span>}
        />
        {allLabels.map((label) => (
          <Bar key={label} dataKey={label} stackId="a" fill={colorMap[label]} radius={0} maxBarSize={48}>
            {/* suppress unused Cell warning */}
            {chartData.map((_, i) => <Cell key={i} />)}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
