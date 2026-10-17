"use client";

import { useEffect, useState } from "react";

/** One 6s cycle for the whole sip: rest, lift, hold at the mouth, lower. */
const SIP = {
  dur: "6s",
  keyTimes: "0;0.5;0.62;0.78;0.9;1",
  // Ease in and out of each move; hold still while resting and sipping.
  keySplines: "0 0 1 1;.42 0 .58 1;0 0 1 1;.42 0 .58 1;0 0 1 1",
};
const LIFT = 26;
const ARM_REST = "M146 140 C 160 148, 157 164, 141 164";
// Same shape, elbow out and hand up at the mouth; the shoulder point never moves.
const ARM_SIP = "M146 140 C 166 144, 162 134, 141 138";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

/**
 * Nudgie having a coffee break: shown on My Actions when nothing is due.
 * Drawn to match the /public/loader GIFs (same 240×240 frame, #f6e412 body,
 * thin black outline, thinner brows, stick limbs with round hands and oval
 * feet, happy closed eyes, purple prop).
 *
 * Every 6s the hand brings the mug to the mouth while the shoulder stays put:
 * the arm path reshapes (SVG <animate>, which Safari supports, unlike CSS
 * path animation), the mug and hand rise, and the steam fades while sipping.
 * Breathing and rising steam are CSS. All motion stops under
 * prefers-reduced-motion.
 */
export default function NudgieCoffee({ className = "" }: { className?: string }) {
  const animate = !usePrefersReducedMotion();
  const timing = { dur: SIP.dur, repeatCount: "indefinite", calcMode: "spline", keyTimes: SIP.keyTimes, keySplines: SIP.keySplines } as const;

  return (
    <svg className={`nudgie-coffee ${className}`} viewBox="70 84 106 132" role="img" aria-label="Nudgie relaxing with a cup of coffee">
      {/* Legs and feet */}
      <g stroke="#000" strokeWidth="2.6" strokeLinecap="round" fill="none">
        <path d="M111 180 L107 202" />
        <path d="M131 180 L135 202" />
      </g>
      <ellipse cx="103" cy="204" rx="8.5" ry="3.8" fill="#000" />
      <ellipse cx="139" cy="204" rx="8.5" ry="3.8" fill="#000" />

      {/* Body, face and the hand-on-hip arm (breathe together) */}
      <g className="nudgie-coffee-body">
        <path d="M96 140 C 80 144, 80 158, 93 161" stroke="#000" strokeWidth="2.6" strokeLinecap="round" fill="none" />
        <circle cx="94" cy="161" r="4.6" fill="#000" />
        <rect x="96" y="92" width="50" height="90" rx="25" fill="#f6e412" stroke="#000" strokeWidth="2.6" />
        {/* Brows */}
        <path d="M106 103 q5 -4 10 0" stroke="#000" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        <path d="M126 103 q5 -4 10 0" stroke="#000" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        {/* Happy closed eyes */}
        <path d="M105 114 q5 -6 10 0" stroke="#000" strokeWidth="2.4" strokeLinecap="round" fill="none" />
        <path d="M127 114 q5 -6 10 0" stroke="#000" strokeWidth="2.4" strokeLinecap="round" fill="none" />
        {/* Smile */}
        <path d="M112 124 q9 8 18 0" stroke="#000" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      </g>

      {/* Mug arm: fixed at the shoulder, bends to bring the mug to the mouth */}
      <path d={ARM_REST} stroke="#000" strokeWidth="2.6" strokeLinecap="round" fill="none">
        {animate && <animate attributeName="d" values={[ARM_REST, ARM_REST, ARM_SIP, ARM_SIP, ARM_REST, ARM_REST].join(";")} {...timing} />}
      </path>

      {/* Hand, mug and steam rise together */}
      <g>
        {animate && (
          <animateTransform
            attributeName="transform"
            type="translate"
            values={`0 0;0 0;0 -${LIFT};0 -${LIFT};0 0;0 0`}
            {...timing}
          />
        )}
        <path d="M112 150 h22 v14 a6 6 0 0 1 -6 6 h-10 a6 6 0 0 1 -6 -6 z" fill="#4d26b3" stroke="#000" strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M134 154 h3.5 a5 5 0 0 1 0 10 h-3.5" fill="none" stroke="#000" strokeWidth="2.2" />
        <path d="M116 156 h14" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="139" cy="164" r="4.6" fill="#000" />
        <g className="nudgie-coffee-steam" stroke="#8f8f8f" strokeWidth="2.5" strokeLinecap="round" fill="none">
          {animate && <animate attributeName="opacity" values="1;1;0;0;1;1" {...timing} />}
          <path d="M117 146 c-3 -4 3 -7 0 -11" />
          <path d="M123 146 c-3 -4 3 -7 0 -11" />
          <path d="M129 146 c-3 -4 3 -7 0 -11" />
        </g>
      </g>
    </svg>
  );
}
