"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface Props {
  data: Array<{
    period: string;
    commonEquity: number | null;
    preferredEquity: number | null;
    totalLiabilities: number | null;
  }>;
}

function formatUsdCompact(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(0)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function formatUsdFull(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export default function CapitalStackChart({ data }: Props) {
  return (
    <div style={{ background: "#ffffff", padding: "8px" }}>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid stroke="#d5dbe7" strokeWidth={1} vertical={false} />
          <XAxis dataKey="period" tick={{ fill: "#5c667d", fontSize: 11 }} />
          <YAxis width={72} tick={{ fill: "#5c667d", fontSize: 11 }} tickFormatter={(v) => formatUsdCompact(Number(v))} />
          <Tooltip
            formatter={(value: number | null) => formatUsdFull(value)}
            labelFormatter={(label) => {
              const [y, m] = String(label).split("-");
              const q = m === "03" ? "Q1" : m === "06" ? "Q2" : m === "09" ? "Q3" : "Q4";
              return `${q} ${y}`;
            }}
          />
          <Legend />
          <Area type="monotone" dataKey="commonEquity" name="Common Equity" stackId="1" stroke="#2f9a62" fill="#2f9a62" />
          <Area type="monotone" dataKey="preferredEquity" name="Preferred Equity" stackId="1" stroke="#7b4cc2" fill="#7b4cc2" />
          <Area type="monotone" dataKey="totalLiabilities" name="Liabilities (Debt Proxy)" stackId="1" stroke="#355f9a" fill="#355f9a" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

