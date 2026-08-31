"use client";

import type { ReactNode } from "react";
import type { XAxisTickContentProps } from "recharts";
import { formatWeekRangeLabel } from "@/lib/cohort-week";

export function weekChartRange(
  startIst: string | null | undefined,
  endIst: string | null | undefined
): string | undefined {
  if (!startIst || !endIst) return undefined;
  return formatWeekRangeLabel(startIst, endIst);
}

type WeekTickDatum = { name: string; weekRange?: string };

/** Two-line X-axis tick: "Week N" plus the delivery-date week range underneath. */
export function makeWeekChartTick(
  data: WeekTickDatum[],
  opts?: { fill?: string; mutedFill?: string; fontSize?: number }
): (props: XAxisTickContentProps) => ReactNode {
  const byName = new Map(data.map((d) => [d.name, d.weekRange]));
  const fill = opts?.fill ?? "var(--color-text-primary)";
  const mutedFill = opts?.mutedFill ?? "var(--color-text-muted)";
  const fontSize = opts?.fontSize ?? 12;

  return (props: XAxisTickContentProps) => {
    const name = String(props.payload?.value ?? "");
    const weekRange = byName.get(name);
    return (
      <g transform={`translate(${props.x},${props.y})`}>
        <text x={0} y={0} dy={12} textAnchor="middle" fill={fill} fontSize={fontSize} fontWeight={600}>
          {name}
        </text>
        {weekRange ? (
          <text x={0} y={0} dy={26} textAnchor="middle" fill={mutedFill} fontSize={Math.max(9, fontSize - 2)} fontWeight={500}>
            {weekRange}
          </text>
        ) : null}
      </g>
    );
  };
}

export function weekChartLabelFormatter(data: WeekTickDatum[]) {
  return (label: unknown) => {
    const name = String(label ?? "");
    const range = data.find((d) => d.name === name)?.weekRange;
    return range ? `${name} · ${range}` : name;
  };
}
