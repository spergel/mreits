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

type Series = {
  key: string;
  label: string;
  color: string;
};

interface Props {
  data: Array<Record<string, string | number | null>>;
  series: Series[];
  ySuffix?: string;
}

export default function MetricLineChart({ data, series, ySuffix = "" }: Props) {
  return (
    <div style={{ background: "#ffffff", padding: "8px" }}>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid stroke="#d5dbe7" strokeWidth={1} vertical={false} />
          <XAxis dataKey="period" tick={{ fill: "#5c667d", fontSize: 11 }} axisLine={{ stroke: "#b9c2d4" }} tickLine={{ stroke: "#b9c2d4" }} />
          <YAxis tickFormatter={(v) => `${v}${ySuffix}`} tick={{ fill: "#5c667d", fontSize: 11 }} axisLine={{ stroke: "#b9c2d4" }} tickLine={{ stroke: "#b9c2d4" }} width={52} />
          <Tooltip />
          <Legend />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={{ r: 2 }}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

