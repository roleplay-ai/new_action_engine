"use client";

import { useState, useEffect } from "react";

const C = {
  dark:   "#221D23",
  amber:  "#FFCE00",
  purple: "#623CEA",
  green:  "#23CE6B",
  orange: "#F68A29",
  red:    "#ED4551",
  blue:   "#3699FC",
  textMute: "rgba(255,255,255,0.50)",
};

interface Particle {
  id: number;
  x: number;
  color: string;
  size: number;
  angle: number;
  speed: number;
  delay: number;
  tx: number;
  ty: number;
}

interface ConfettiCelebrationProps {
  actionTitle?: string;
  onContinue: () => void;
  onClose: () => void;
  isHabitFlow?: boolean;
}

function makeParticles(): Particle[] {
  const colors = [C.amber, C.purple, C.green, C.orange, C.red, C.blue];
  return Array.from({ length: 48 }, (_, i) => ({
    id: i,
    x: 30 + Math.random() * 40,
    color: colors[i % 6],
    size: 6 + Math.random() * 8,
    angle: Math.random() * 360,
    speed: 0.9 + Math.random() * 1.6,
    delay: Math.random() * 0.45,
    tx: (Math.random() - 0.5) * 220,
    ty: 80 + Math.random() * 160,
  }));
}

export default function ConfettiCelebration({
  actionTitle,
  onContinue,
  onClose,
  isHabitFlow = false,
}: ConfettiCelebrationProps) {
  const [particles, setParticles] = useState<Particle[]>([]);

  const fire = () => {
    setParticles(makeParticles());
    setTimeout(() => setParticles([]), 2600);
  };

  // Auto-fire on mount
  useEffect(() => {
    fire();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const keyframeCSS = particles
    .map(
      (p) =>
        `@keyframes cf${p.id}{` +
        `0%{transform:translate(0,0) rotate(${p.angle}deg);opacity:1}` +
        `100%{transform:translate(${p.tx}px,${p.ty}px) rotate(${p.angle + 720}deg);opacity:0}}`
    )
    .join("");

  return (
    <div
      style={{
        background: C.dark,
        borderRadius: 20,
        padding: "36px 28px 32px",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
        width: "100%",
      }}
    >
      {/* Injected keyframes */}
      {particles.length > 0 && <style>{keyframeCSS}</style>}

      {/* Confetti particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          aria-hidden="true"
          style={{
            position: "absolute",
            left: `${p.x}%`,
            top: "35%",
            width: p.size,
            height: p.size * 0.45,
            background: p.color,
            borderRadius: 2,
            animation: `cf${p.id} ${p.speed}s ${p.delay}s ease-out both`,
            transform: `rotate(${p.angle}deg)`,
            pointerEvents: "none",
          }}
        />
      ))}

      {/* Close (×) — top right, invisible touch target */}
      <button
        onClick={onClose}
        aria-label="Done for today"
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

      {/* Trophy */}
      <div
        style={{
          fontSize: 52,
          marginBottom: 16,
          filter: "drop-shadow(0 4px 16px rgba(255,206,0,0.4))",
          lineHeight: 1,
        }}
      >
        🏆
      </div>

      {/* Heading */}
      <h3
        style={{
          color: "#FFFFFF",
          fontWeight: 800,
          fontSize: 20,
          marginBottom: 6,
          letterSpacing: "-0.01em",
        }}
      >
        Rep Verified!
      </h3>

      {/* Persuasive body copy */}
      <p
        style={{
          color: C.textMute,
          fontSize: 12,
          lineHeight: 1.6,
          maxWidth: 280,
          marginTop: 0,
          marginBottom: 8,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        One rep logged. Science says it takes 5 consistent reps to wire a new behaviour into your brain — you&apos;re on your way.
      </p>
      <p
        style={{
          color: C.amber,
          fontSize: 12,
          fontWeight: 700,
          marginBottom: 24,
          marginTop: 8,
          letterSpacing: "0.01em",
        }}
      >
        4 more reps to cement this habit.
      </p>

      {/* Badges row */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 28,
        }}
      >
        {[
          { label: "+50 XP",      color: C.amber  },
          { label: "🔥 Streak",   color: C.orange },
          { label: "✅ Validated", color: C.green  },
        ].map((b) => (
          <span
            key={b.label}
            style={{
              background: `${b.color}22`,
              color: b.color,
              fontSize: 12,
              fontWeight: 700,
              padding: "6px 14px",
              borderRadius: 99,
              border: `1px solid ${b.color}44`,
            }}
          >
            {b.label}
          </span>
        ))}
      </div>

      {/* CTA */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <button
          onClick={onContinue}
          style={{
            background: C.green,
            color: "#FFFFFF",
            border: "none",
            borderRadius: 99,
            padding: "13px 28px",
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
            boxShadow: "0 6px 20px rgba(35,206,107,0.35)",
            width: "100%",
          }}
        >
          {isHabitFlow ? "Start Habit Loop" : "Turn this into a Habit"}
        </button>

        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: "rgba(255,255,255,0.35)",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            padding: "8px",
            width: "100%",
          }}
        >
          Done for today
        </button>
      </div>
    </div>
  );
}
