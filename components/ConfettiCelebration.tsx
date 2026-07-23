"use client";

import { useState, useEffect } from "react";

const C = {
  dark: "#221D23",
  amber: "#FFCE00",
  purple: "#623CEA",
  green: "#23CE6B",
  orange: "#F68A29",
  red: "#ED4551",
  blue: "#3699FC",
  pink: "#FF5CAD",
  textMute: "rgba(255,255,255,0.50)",
};

interface Particle {
  id: number;
  color: string;
  size: number;
  angle: number;
  spin: number;
  duration: number;
  delay: number;
  tx: number;
  ty: number;
  shape: "rect" | "circle" | "ribbon";
}

interface ConfettiCelebrationProps {
  actionTitle?: string;
  onContinue: () => void;
  onClose: () => void;
}

function makeParticles(): Particle[] {
  const colors = [C.amber, C.purple, C.green, C.orange, C.red, C.blue, C.pink];
  const shapes: Particle["shape"][] = ["rect", "circle", "ribbon"];

  return Array.from({ length: 120 }, (_, i) => {
    const theta = (Math.PI * 2 * i) / 120 + (Math.random() - 0.5) * 0.45;
    const distance = 180 + Math.random() * 420;
    const shape = shapes[i % 3];
    return {
      id: i,
      color: colors[i % colors.length],
      size: shape === "ribbon" ? 4 + Math.random() * 4 : 7 + Math.random() * 10,
      angle: Math.random() * 360,
      spin: 360 + Math.random() * 720,
      duration: 1.1 + Math.random() * 1.6,
      delay: Math.random() * 0.25,
      tx: Math.cos(theta) * distance,
      ty: Math.sin(theta) * distance * 0.85 + 40 + Math.random() * 120,
      shape,
    };
  });
}

export default function ConfettiCelebration({
  actionTitle,
  onContinue,
  onClose,
}: ConfettiCelebrationProps) {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    setParticles(makeParticles());
    const clearTimer = setTimeout(() => setParticles([]), 5000);
    return () => clearTimeout(clearTimer);
  }, []);

  const keyframeCSS = particles
    .map(
      (p) =>
        `@keyframes cf${p.id}{` +
        `0%{transform:translate(-50%,-50%) scale(1) rotate(${p.angle}deg);opacity:1}` +
        `70%{opacity:1}` +
        `100%{transform:translate(calc(-50% + ${p.tx}px),calc(-50% + ${p.ty}px)) scale(0.35) rotate(${p.angle + p.spin}deg);opacity:0}}`
    )
    .join("");

  return (
    <div
      className="fixed inset-0 z-[240] flex items-center justify-center p-4 sm:p-8"
      style={{
        background: "rgba(34,29,35,0.55)",
        backdropFilter: "blur(8px)",
        overflow: "hidden",
      }}
    >
      {particles.length > 0 && <style>{keyframeCSS}</style>}

      {/* Party burst from center */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          overflow: "hidden",
        }}
      >
        {particles.map((p) => (
          <div
            key={p.id}
            style={{
              position: "absolute",
              left: "50%",
              top: "42%",
              width: p.shape === "ribbon" ? p.size : p.size,
              height:
                p.shape === "circle"
                  ? p.size
                  : p.shape === "ribbon"
                    ? p.size * 3.2
                    : p.size * 0.45,
              background: p.color,
              borderRadius: p.shape === "circle" ? "50%" : p.shape === "ribbon" ? 2 : 2,
              animation: `cf${p.id} ${p.duration}s ${p.delay}s cubic-bezier(0.12,0.75,0.28,1) both`,
              boxShadow: `0 0 0 1px ${p.color}33`,
            }}
          />
        ))}
      </div>

      {/* Centered celebration popup */}
      <div
        className="animate-pop"
        style={{
          position: "relative",
          zIndex: 1,
          background: C.dark,
          borderRadius: 20,
          padding: "36px 28px 32px",
          textAlign: "center",
          overflow: "hidden",
          width: "100%",
          maxWidth: 420,
          boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close celebration"
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

        <div
          style={{
            fontSize: 52,
            marginBottom: 16,
            filter: "drop-shadow(0 4px 16px rgba(255,206,0,0.4))",
            lineHeight: 1,
          }}
        >
          🎉
        </div>

        <h3
          style={{
            color: "#FFFFFF",
            fontWeight: 800,
            fontSize: 20,
            marginBottom: 6,
            letterSpacing: "-0.01em",
          }}
        >
          Action Verified!
        </h3>

        {actionTitle && (
          <p
            style={{
              color: "rgba(255,255,255,0.65)",
              fontSize: 13,
              lineHeight: 1.5,
              marginTop: 0,
              marginBottom: 10,
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            {actionTitle}
          </p>
        )}

        <p
          style={{
            color: C.textMute,
            fontSize: 12,
            lineHeight: 1.6,
            maxWidth: 280,
            marginTop: 0,
            marginBottom: 24,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          Nice work closing the knowing-doing gap. Keep the momentum going with a weekly reminder.
        </p>

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
            { label: "+50 XP", color: C.amber },
            { label: "🔥 Streak", color: C.orange },
            { label: "✅ Validated", color: C.green },
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
            Done
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
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
