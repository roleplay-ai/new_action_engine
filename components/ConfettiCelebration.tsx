"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";

const C = {
  ink: "#221D23",
  amber: "#FFCE00",
  purple: "#623CEA",
  green: "#23CE6B",
  orange: "#F68A29",
  red: "#ED4551",
  blue: "#3699FC",
  pink: "#FF5CAD",
  textSecondary: "#4A4047",
  textMuted: "#8A8090",
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
  pointsDelta?: number;
  completedLate?: boolean;
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
  pointsDelta,
  completedLate = false,
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
        background: "rgba(34,29,35,0.6)",
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

      {/* Centered celebration popup, styled like the app's other popups: white
          card, yellow icon badge, yellow primary CTA. */}
      <div
        className="celebration-modal"
        style={{
          position: "relative",
          zIndex: 1,
          background: "#fff",
          border: "1px solid rgba(34,29,35,.06)",
          borderRadius: 22,
          padding: "28px 26px 26px",
          textAlign: "center",
          overflow: "hidden",
          width: "100%",
          maxWidth: 420,
          boxShadow: "0 24px 70px rgba(17,14,18,.24)",
          animation: "scalePop .2s ease-out both",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close celebration"
          style={{
            width: 35,
            height: 35,
            display: "grid",
            placeItems: "center",
            position: "absolute",
            top: 14,
            right: 14,
            border: "1px solid var(--color-border)",
            borderRadius: 11,
            background: "#fff",
            color: "var(--color-text-secondary)",
            cursor: "pointer",
          }}
        >
          <X size={16} strokeWidth={2.5} />
        </button>

        <div
          style={{
            width: 56,
            height: 56,
            margin: "0 auto 16px",
            display: "grid",
            placeItems: "center",
            borderRadius: 17,
            background: C.amber,
            fontSize: 28,
            lineHeight: 1,
          }}
        >
          🎉
        </div>

        <h3
          style={{
            color: C.ink,
            fontWeight: 800,
            fontSize: 20,
            marginBottom: 6,
            letterSpacing: "-0.01em",
          }}
        >
          Action completed!
        </h3>

        {actionTitle && (
          <p
            style={{
              color: C.textSecondary,
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
            color: C.textMuted,
            fontSize: 12,
            lineHeight: 1.6,
            maxWidth: 280,
            marginTop: 0,
            marginBottom: 24,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          {completedLate
            ? "You completed this after its assigned day. The earlier points deduction stays unchanged."
            : "Nice work closing the knowing-doing gap. Keep the momentum going."}
        </p>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 26,
          }}
        >
          {[
            { label: completedLate ? "No points" : pointsDelta && pointsDelta > 0 ? `+${pointsDelta} points` : "Completed", color: "#8C7000" },
            { label: "🔥 Streak", color: C.orange },
            { label: completedLate ? "✅ Recorded late" : "✅ Recorded", color: "#0A6632" },
          ].map((b) => (
            <span
              key={b.label}
              style={{
                background: `${b.color}18`,
                color: b.color,
                fontSize: 12,
                fontWeight: 700,
                padding: "6px 14px",
                borderRadius: 99,
                border: `1px solid ${b.color}33`,
              }}
            >
              {b.label}
            </span>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={onContinue} className="journey-primary-button" style={{ width: "100%" }}>
            Done
          </button>

          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--color-text-muted)",
              fontSize: 12,
              fontWeight: 700,
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
