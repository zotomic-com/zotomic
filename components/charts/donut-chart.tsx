"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

interface Slice {
  name: string;
  value: number;
  color?: string;
}

interface Props {
  data: Slice[];
  height?: number;
  centerLabel?: string;
  centerValue?: string;
}

const palette = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export default function DonutChart({ data, height = 220, centerLabel, centerValue }: Props) {
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="92%"
            paddingAngle={2}
            stroke="none"
          >
            {data.map((s, i) => (
              <Cell key={s.name} fill={s.color ?? palette[i % palette.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              fontSize: 12,
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      {(centerValue || centerLabel) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {centerValue && <span className="text-lg font-extrabold text-fg">{centerValue}</span>}
          {centerLabel && <span className="text-xs text-fg-subtle">{centerLabel}</span>}
        </div>
      )}
    </div>
  );
}
