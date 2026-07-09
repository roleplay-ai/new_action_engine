"use client";

import { useState, useEffect, useRef } from "react";

const C = {
  dark:     "#221D23",
  amber:    "#FFCE00",
  green:    "#23CE6B",
  textMute: "rgba(255,255,255,0.50)",
};

const STARS = Array.from({ length: 12 }, (_, i) => i);

interface RocketLaunchIconProps {
  onClose: () => void;
}

export default function RocketLaunchIcon({ onClose }: RocketLaunchIconProps) {
  const [stage, setStage] = useState<1 | 2>(1);
  const [count, setCount] = useState(3);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-start countdown on mount
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCount((c) => {
        if (c <= 1) {
          clearInterval(intervalRef.current!);
          setStage(2);
          return 0;
        }
        return c - 1;
      });
    }, 700);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <div
      style={{
        background: "radial-gradient(ellipse at top, #0a0a2e 0%, #221D23 70%)",
        borderRadius: 20,
        padding: "40px 28px 32px",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
        width: "100%",
      }}
    >
      {/* Twinkling stars */}
      {STARS.map((_, i) => (
        <div
          key={i}
          aria-hidden="true"
          style={{
            position: "absolute",
            width: 2 + (i % 3),
            height: 2 + (i % 3),
            borderRadius: "50%",
            background: "#fff",
            top: `${(5 + i * 7) % 55}%`,
            left: `${(8 + i * 11) % 90}%`,
            animation: `starTwinkle ${1.5 + (i % 4) * 0.5}s ${i * 0.3}s ease-in-out infinite`,
            opacity: 0.6,
          }}
        />
      ))}

      {/* Close × — only in stage 2 */}
      {stage === 2 && (
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "rgba(255,255,255,0.35)",
            fontSize: 20,
            lineHeight: 1,
            padding: 6,
          }}
        >
          ×
        </button>
      )}

      <div style={{ position: "relative", zIndex: 1 }}>

        {/* Countdown number */}
        {stage === 1 && (
          <div
            key={count}
            style={{
              fontSize: 64,
              fontWeight: 800,
              color: C.amber,
              animation: "countdownPop 0.4s cubic-bezier(0.16,1,0.3,1) both",
              marginBottom: 8,
              lineHeight: 1,
            }}
          >
            {count}
          </div>
        )}

        {/* Rocket */}
        <div
          style={{
            fontSize: stage === 2 ? 72 : 56,
            lineHeight: 1,
            marginBottom: stage === 2 ? 0 : 12,
            animation:
              stage === 2
                ? "rocketLaunch 1.2s ease-in forwards"
                : "rocketPulse 0.7s ease-in-out infinite",
            display: "inline-block",
          }}
        >
          🚀
        </div>

        {/* Thrust flame during liftoff */}
        {stage === 2 && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              bottom: 80,
              left: "50%",
              transform: "translateX(-50%)",
              animation: "thrustFlame 0.3s ease-in-out infinite",
              fontSize: 32,
            }}
          >
            🔥
          </div>
        )}

        {/* Heading */}
        <h3
          style={{
            color: "#fff",
            fontWeight: 800,
            fontSize: 18,
            marginBottom: 8,
            marginTop: stage === 2 ? 0 : 12,
            animation: stage === 2 ? "launchText 0.5s 0.3s ease both" : "none",
            opacity: stage === 2 ? undefined : 1,
          }}
        >
          {stage === 1 ? "Locking in your habit…" : "Habit Loop Activated! 🌟"}
        </h3>

        {/* Body */}
        <p
          style={{
            color: C.textMute,
            fontSize: 13,
            lineHeight: 1.6,
            marginTop: 0,
            marginBottom: stage === 2 ? 28 : 0,
            marginLeft: "auto",
            marginRight: "auto",
            maxWidth: 260,
            animation: stage === 2 ? "launchText 0.5s 0.5s ease both" : "none",
          }}
        >
          {stage === 1
            ? "Scheduling your commitment…"
            : "Your schedule is locked. Show up consistently — the compound effect is now in motion."}
        </p>

        {/* Stage 2: amber accent + CTA */}
        {stage === 2 && (
          <>
            <p
              style={{
                color: C.amber,
                fontSize: 12,
                fontWeight: 700,
                marginTop: 10,
                marginBottom: 24,
                letterSpacing: "0.01em",
                animation: "launchText 0.5s 0.65s ease both",
              }}
            >
              5 reps. One at a time. You&apos;ve got this.
            </p>

            <button
              onClick={onClose}
              style={{
                background: C.green,
                color: "#fff",
                border: "none",
                borderRadius: 99,
                padding: "13px 32px",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
                boxShadow: "0 6px 20px rgba(35,206,107,0.35)",
                width: "100%",
                animation: "fadeUp 0.5s 1s ease both",
              }}
            >
              Let&apos;s go →
            </button>
          </>
        )}
      </div>
    </div>
  );
}
