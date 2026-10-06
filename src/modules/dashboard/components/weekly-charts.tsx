"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Point {
  day: string;
  revenue: number;
  orders: number;
}

const axisProps = {
  stroke: "currentColor",
  tickLine: false,
  axisLine: false,
  className: "text-xs text-muted-foreground",
} as const;

function ChartTooltip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: { value?: number | string }[];
  label?: string | number;
  format: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-popover-foreground">{label}</p>
      <p className="tabular-nums text-muted-foreground">{format(Number(payload[0]?.value ?? 0))}</p>
    </div>
  );
}

export function WeeklyCharts({ data, currency }: { data: Point[]; currency: string }) {
  const money = (v: number) =>
    new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(v);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Revenue, last 7 days</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
              <XAxis dataKey="day" {...axisProps} />
              <YAxis width={56} tickFormatter={money} {...axisProps} />
              <Tooltip
                cursor={{ fill: "var(--viz-grid)" }}
                content={<ChartTooltip format={money} />}
              />
              <Bar
                dataKey="revenue"
                fill="var(--viz-series-1)"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Orders, last 7 days</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
              <XAxis dataKey="day" {...axisProps} />
              <YAxis width={40} allowDecimals={false} {...axisProps} />
              <Tooltip
                cursor={{ stroke: "var(--viz-grid)" }}
                content={<ChartTooltip format={(v) => `${v} orders`} />}
              />
              <Line
                type="monotone"
                dataKey="orders"
                stroke="var(--viz-series-1)"
                strokeWidth={2}
                dot={{ r: 4, strokeWidth: 0, fill: "var(--viz-series-1)" }}
                activeDot={{ r: 6, strokeWidth: 2, stroke: "var(--background)" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
