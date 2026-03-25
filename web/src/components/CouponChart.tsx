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
      background: "#f7f8fa",
      border: "1px solid #9aa7bc",
      padding: "6px 8px",
      fontFamily: '"Tahoma", "Verdana", Arial, sans-serif',
      fontSize: "11px",
      boxShadow: "2px 2px 0 #c2c8d6",
      maxWidth: "280px",
      color: "#1f2a44",
    }}>
      <div style={{
        fontWeight: "bold",
        marginBottom: "3px",
        paddingBottom: "2px",
        borderBottom: "1px solid #c2c8d6",
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
            <span style={{ fontFamily: '"Courier New", monospace', whiteSpace: "nowrap" }}>
              {formatPct(entry.value)}
              {dataMode === "value" && rawVal != null && (
                <span style={{ color: "#6b7486" }}> ({formatLargeValue(rawVal)})</span>
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
    <div style={{ background: "#ffffff", padding: "8px" }}>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid stroke="#d5dbe7" strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="period"
            tick={{ fill: "#5c667d", fontSize: 11, fontFamily: '"Tahoma", "Verdana", Arial, sans-serif' }}
            axisLine={{ stroke: "#b9c2d4" }}
            tickLine={{ stroke: "#b9c2d4" }}
          />
          <YAxis
            tickFormatter={(v) => `${v}%`}
            tick={{ fill: "#5c667d", fontSize: 11, fontFamily: '"Tahoma", "Verdana", Arial, sans-serif' }}
            axisLine={{ stroke: "#b9c2d4" }}
            tickLine={{ stroke: "#b9c2d4" }}
            domain={[0, 100]}
            width={44}
          />
          <Tooltip
            content={<CustomTooltip dataMode={dataMode} />}
            cursor={{ fill: "rgba(61, 86, 138, 0.08)" }}
          />
          <Legend
            wrapperStyle={{
              fontSize: "11px",
              fontFamily: '"Tahoma", "Verdana", Arial, sans-serif',
              paddingTop: "6px",
            }}
            formatter={(value) => <span style={{ color: "#1f2a44" }}>{value}</span>}
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
