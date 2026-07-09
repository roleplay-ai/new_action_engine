"use client";

// SkillProgressBars - Nudgeable.ai Component
// Usage: import SkillProgressBars from '@/components/admin/SkillProgressBars';
//        <SkillProgressBars bars={[...]} />

import { useState, useEffect, useRef } from "react";

export interface SkillBar {
  label: string;
  value: number;       // 0–100
  color: string;       // hex or css variable
  sublabel?: string;   // e.g. "14 actions"
  max?: number;        // defaults to 100
}

interface SkillProgressBarsProps {
  bars: SkillBar[];
  animationDelay?: number;   // ms between each bar animating in, default 80
  animationDuration?: number; // ms for fill transition, default 700
  showValues?: boolean;       // default true
  compact?: boolean;          // tighter spacing
  className?: string;
}

export default function SkillProgressBars({
  bars,
  animationDelay = 80,
  animationDuration = 700,
  showValues = true,
  compact = false,
  className = "",
}: SkillProgressBarsProps) {
  const [filled, setFilled] = useState<boolean[]>(bars.map(() => false));
  const timerRef = useRef<NodeJS.Timeout[]>([]);

  useEffect(() => {
    // Stagger each bar filling in
    timerRef.current.forEach(clearTimeout);
    timerRef.current = [];

    const timers = bars.map((_, i) => {
      const t = setTimeout(() => {
        setFilled((prev) => {
          const next = [...prev];
          next[i] = true;
          return next;
        });
      }, i * animationDelay + 120);
      return t;
    });

    timerRef.current = timers;
    return () => timers.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars.map((b) => b.value).join(","), animationDelay]);

  if (bars.length === 0) {
    return (
      <div className={`flex items-center justify-center py-8 text-sm font-medium ${className}`} style={{ color: "var(--color-text-muted)" }}>
        No data available
      </div>
    );
  }

  return (
    <div className={`space-y-${compact ? "2" : "4"} ${className}`}>
      {bars.map((bar, i) => {
        const max = bar.max ?? 100;
        const pct = Math.min(100, Math.max(0, (bar.value / max) * 100));
        const isReady = filled[i];

        return (
          <div key={`${bar.label}-${i}`} className={compact ? "space-y-1" : "space-y-1.5"}>

            {/* Label row */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                {/* Color dot */}
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: bar.color }}
                />
                <div className="min-w-0">
                  <span
                    className="text-sm font-semibold truncate block"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {bar.label}
                  </span>
                  {bar.sublabel && (
                    <span
                      className="text-xs block"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {bar.sublabel}
                    </span>
                  )}
                </div>
              </div>

              {/* Value badge */}
              {showValues && (
                <span
                  className="text-sm font-bold tabular-nums flex-shrink-0 min-w-[3rem] text-right transition-opacity duration-300"
                  style={{
                    color: bar.color,
                    opacity: isReady ? 1 : 0,
                  }}
                >
                  {bar.max && bar.max !== 100
                    ? bar.value.toLocaleString()
                    : `${bar.value}%`}
                </span>
              )}
            </div>

            {/* Track */}
            <div
              className="w-full rounded-full overflow-hidden"
              style={{
                height: compact ? "6px" : "8px",
                background: "var(--color-bg-muted)",
              }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: isReady ? `${pct}%` : "0%",
                  background: `linear-gradient(90deg, ${bar.color}cc, ${bar.color})`,
                  transition: `width ${animationDuration}ms cubic-bezier(0.16,1,0.3,1)`,
                  boxShadow: isReady ? `0 0 8px ${bar.color}55` : "none",
                }}
              />
            </div>

          </div>
        );
      })}
    </div>
  );
}
