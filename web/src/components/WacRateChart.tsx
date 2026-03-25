"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { PeriodSnapshot, RatePoint } from "@/types/mreit";
import { formatPeriod } from "@/lib/formatters";

interface Props {
  periods: PeriodSnapshot[];
  rates: RatePoint[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#f7f8fa",
      border: "1px solid #9aa7bc",
      padding: "6px 8px",
      fontFamily: '"Tahoma", "Verdana", Arial, sans-serif',
      fontSize: "11px",
      boxShadow: "2px 2px 0 #c2c8d6",
      color: "#1f2a44",
    }}>
      <div style={{ fontWeight: "bold", marginBottom: "3px", paddingBottom: "2px", borderBottom: "1px solid #c2c8d6" }}>
        {label}
      </div>
      {payload.map((entry: { color: string; name: string; value: number | null }) => (
        <div key={entry.name} style={{ display: "flex", gap: "8px", justifyContent: "space-between" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ width: 10, height: 10, background: entry.color, border: "1px solid #000", display: "inline-block" }} />
            {entry.name}
          </span>
          <span style={{ fontFamily: '"Courier New", monospace' }}>
            {entry.value != null ? entry.value.toFixed(2) + "%" : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function WacRateChart({ periods, rates }: Props) {
  // Build a date → dgs10 lookup
  const rateByDate = new Map(rates.map((r) => [r.date, r.dgs10]));

  const chartData = periods
    .filter((p) => p.wac !== null)
    .map((p) => ({
      period: formatPeriod(p.period),
      WAC: p.wac !== null ? parseFloat(p.wac.toFixed(2)) : null,
      "10Y Tsy": rateByDate.has(p.period)
        ? parseFloat(rateByDate.get(p.period)!.toFixed(2))
        : null,
    }));

  if (chartData.length === 0) return null;

  return (
    <div style={{ background: "#ffffff", padding: "8px" }}>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
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
            domain={["auto", "auto"]}
            width={44}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(61, 86, 138, 0.2)" }} />
          <Legend
            wrapperStyle={{ fontSize: "11px", fontFamily: '"Tahoma", "Verdana", Arial, sans-serif', paddingTop: "6px" }}
            formatter={(value) => <span style={{ color: "#1f2a44" }}>{value}</span>}
            iconType="line"
          />
          <Line
            type="monotone"
            dataKey="WAC"
            stroke="#00ff88"
            strokeWidth={2}
            dot={{ r: 3, fill: "#00ff88", stroke: "#00ff88" }}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="10Y Tsy"
            stroke="#ff8800"
            strokeWidth={2}
            dot={{ r: 3, fill: "#ff8800", stroke: "#ff8800" }}
            strokeDasharray="5 3"
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
