"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { money } from "@/lib/money";

interface Props {
  data: Record<string, number | string>[];
  xKey: string;
  yKey: string;
  height?: number;
  /** when set, y-axis + tooltip values are formatted as money in this currency */
  currency?: string;
}

export default function LineChart({ data, xKey, yKey, height = 240, currency }: Props) {
  const fmt = currency ? (v: number) => money(v, currency) : undefined;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="lc-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis
          dataKey={xKey}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fill: "var(--fg-subtle)" }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={currency ? 60 : 44}
          tick={{ fontSize: 12, fill: "var(--fg-subtle)" }}
          tickFormatter={fmt ? (v) => fmt(Number(v)) : undefined}
        />
        <Tooltip
          contentStyle={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            fontSize: 12,
          }}
          formatter={fmt ? (v) => fmt(Number(v)) : undefined}
        />
        <Area
          type="monotone"
          dataKey={yKey}
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill="url(#lc-fill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
