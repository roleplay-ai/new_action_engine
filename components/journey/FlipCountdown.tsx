"use client";

type FlipCountdownProps = {
  /** Whole days remaining from local midnight today. Negative/zero values are clamped to 0 for display. */
  days: number;
  label: string;
};

function digitsFor(days: number): string[] {
  const clamped = Math.max(0, Math.floor(days));
  const width = clamped >= 100 ? 3 : 2;
  return clamped.toString().padStart(width, "0").split("");
}

/** A flip-clock style "X days to go" readout. Each digit remounts (via its
 * key) when its value changes, which combined with the CSS flip-in animation
 * on .rcpl-flip-card-inner gives the classic flip-card motion once a day. */
export default function FlipCountdown({ days, label }: FlipCountdownProps) {
  const displayDays = Math.max(0, Math.floor(days));
  const digits = digitsFor(displayDays);
  return (
    <div className="rcpl-flip-countdown" role="timer" aria-label={`${displayDays} ${label}`}>
      <div className="rcpl-flip-digits">
        {digits.map((digit, index) => (
          <div className="rcpl-flip-card" key={`${index}-${digit}`}>
            <div className="rcpl-flip-card-inner">{digit}</div>
          </div>
        ))}
      </div>
      <small className="rcpl-flip-label">{label}</small>
    </div>
  );
}
