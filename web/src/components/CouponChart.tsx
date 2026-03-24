"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
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
    <div style={{
      background: "#000033",
      border: "1px solid #00ff00",
      padding: "4px 8px",
      fontFamily: '"Courier New", monospace',
      fontSize: "11px",
      boxShadow: "2px 2px 4px #000000",
      maxWidth: "280px",
      color: "#ccffcc",
    }}>
      <div style={{
        fontWeight: "bold",
        marginBottom: "3px",
        paddingBottom: "2px",
        borderBottom: "1px solid #006600",
        color: "#ffff00",
      }}>
        {label}
      </div>
      {[...payload].reverse().map((entry: {
        color: string;
        name: string;
        value: number;
        payload: Record<string, number>;
      }) => {
        const rawKey = `__raw_${entry.name}`;
        const rawVal = entry.payload[rawKey];
        return (
          <div key={entry.name} style={{ display: "flex", gap: "8px", justifyContent: "space-between" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{
                width: "10px", height: "10px",
                background: entry.color,
                border: "1px solid #000",
                display: "inline-block",
                flexShrink: 0,
              }} />
              <span style={{ maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {entry.name}
              </span>
            </span>
            <span style={{ fontFamily: "Courier New, monospace", whiteSpace: "nowrap" }}>
              {formatPct(entry.value)}
              {dataMode === "value" && rawVal != null && (
                <span style={{ color: "#666" }}> ({formatLargeValue(rawVal)})</span>
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
    <div style={{ background: "#000011", padding: "8px" }}>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid stroke="#003300" strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="period"
            tick={{ fill: "#aaaaaa", fontSize: 11, fontFamily: '"Courier New", monospace' }}
            axisLine={{ stroke: "#006600" }}
            tickLine={{ stroke: "#006600" }}
          />
          <YAxis
            tickFormatter={(v) => `${v}%`}
            tick={{ fill: "#aaaaaa", fontSize: 11, fontFamily: '"Courier New", monospace' }}
            axisLine={{ stroke: "#006600" }}
            tickLine={{ stroke: "#006600" }}
            domain={[0, 100]}
            width={44}
          />
          <Tooltip
            content={<CustomTooltip dataMode={dataMode} />}
            cursor={{ fill: "rgba(0,255,0,0.05)" }}
          />
          <Legend
            wrapperStyle={{
              fontSize: "11px",
              fontFamily: '"Courier New", monospace',
              paddingTop: "6px",
            }}
            formatter={(value) => <span style={{ color: "#ccffcc" }}>{value}</span>}
            iconType="square"
            iconSize={10}
          />
          {allLabels.map((label) => (
            <Bar
              key={label}
              dataKey={label}
              stackId="a"
              fill={colorMap[label]}
              radius={0}
              maxBarSize={44}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
