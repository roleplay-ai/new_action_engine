import React from "react";

type PageLoaderProps = {
  /** Optional status text under the scan row */
  label?: string;
  /** Optional second line under the label — lighter weight, for a short explanatory note (e.g. an expected wait time) */
  sublabel?: string;
  /**
   * Where the overlay sits:
   * - main: participant content area (keeps sidebar clear)
   * - admin: admin content area (keeps admin sidebar clear)
   * - fullscreen: entire viewport (auth, etc.)
   */
  variant?: "main" | "admin" | "fullscreen";
  /**
   * Swaps the default scan row for a themed visual:
   * - default: magnifier searching through a row of files
   * - wallet: coins dropping into the Commitment Points bucket
   */
  theme?: "default" | "wallet";
};

// Chip centers (x) for the file row, right to left — the magnifier travels this same order. Each
// delay is set to when pageLoaderScan's own lens *arrives* at that chip (its "arrive" keyframe,
// 7% of SCAN_DURATION before its "peak" one) — not when it peaks — because pageLoaderChipMagnify
// now ramps up over that same 7% window, so the file grows in step with the lens's own dwell-pulse
// and both reach full size at the same instant, instead of the file popping only once the lens has
// already finished growing.
const SCAN_DURATION = 4.9;
const SCAN_CHIP_X = [34, 78, 122, 166, 210, 254, 298];
const SCAN_CHIP_DELAYS = [4.27, 3.58, 2.89, 2.21, 1.52, 0.84, 0.15];
const SCAN_CENTER_Y = 54;

/** File/document glyph — folded corner, three text lines (last one short, like real body copy).
 * "neutral" is the plain resting look; "magnify" is the same glyph, amber, used only as the
 * transient overlay that grows in place (see SearchScanLoader) — never a separate/generic icon. */
function FileGlyph({ tone }: { tone: "neutral" | "magnify" }) {
  const stroke = tone === "neutral" ? "rgba(255,255,255,0.55)" : "#FFCE00";
  const bodyFill = tone === "magnify" ? "rgba(255, 206, 0, 0.22)" : "none";
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <path d="M -6,-8 L 3,-8 L 6,-5 L 6,8 L -6,8 Z" fill={bodyFill} stroke={stroke} strokeWidth={1.6} />
      <path d="M 3,-8 L 3,-5 L 6,-5 Z" fill={bodyFill} stroke={stroke} strokeWidth={1.6} />
      <line x1={-3.5} y1={-1.5} x2={3.5} y2={-1.5} stroke={stroke} strokeWidth={1.3} />
      <line x1={-3.5} y1={1} x2={3.5} y2={1} stroke={stroke} strokeWidth={1.3} />
      <line x1={-3.5} y1={3.5} x2={1} y2={3.5} stroke={stroke} strokeWidth={1.3} />
    </g>
  );
}

/** Row of files getting swept by a searching magnifier. Each file sits still and colorless until
 * the (transparent) lens is directly over it, at which point that exact file — same glyph, same
 * spot, drawn again on top of itself in amber — grows up to ~2x and fades right back down as the
 * lens moves on. No duplicate row, no clip-path: the position and timing alone are what keep the
 * effect locked to whatever the lens is actually over, so it can't drift into a generic overlay. */
function SearchScanLoader() {
  return (
    <svg className="page-loader__scan" viewBox="0 0 340 112" role="img" aria-hidden="true">
      <defs>
        <filter id="pageLoaderScanGlow" x="-80%" y="-80%" width="260%" height="260%">
          <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#FFCE00" floodOpacity="0.55" />
        </filter>
      </defs>

      <line
        x1={SCAN_CHIP_X[0] - 6}
        y1={SCAN_CENTER_Y}
        x2={SCAN_CHIP_X[SCAN_CHIP_X.length - 1] + 6}
        y2={SCAN_CENTER_Y}
        className="page-loader__rail"
      />

      {SCAN_CHIP_X.map((cx, i) => (
        <g key={cx}>
          <rect x={cx - 15} y={SCAN_CENTER_Y - 15} width={30} height={30} rx={10} className="page-loader__chip-base" />
          <g transform={`translate(${cx} ${SCAN_CENTER_Y})`}>
            <g
              className="page-loader__chip-neutral"
              style={{ animationDelay: `${SCAN_CHIP_DELAYS[i]}s`, animationDuration: `${SCAN_DURATION}s` }}
            >
              <FileGlyph tone="neutral" />
            </g>
            <g
              className="page-loader__chip-magnify"
              style={{ animationDelay: `${SCAN_CHIP_DELAYS[i]}s`, animationDuration: `${SCAN_DURATION}s` }}
            >
              <FileGlyph tone="magnify" />
            </g>
          </g>
        </g>
      ))}

      <g className="page-loader__scanner" style={{ animationDuration: `${SCAN_DURATION}s` }}>
        <circle r={29} className="page-loader__lens" filter="url(#pageLoaderScanGlow)" />
        <circle r={24} className="page-loader__lens-inner" />
        <line x1={20} y1={20} x2={36} y2={36} className="page-loader__handle" />
        <circle cx={36} cy={36} r={3.4} className="page-loader__handle-tip" />
      </g>
    </svg>
  );
}

// Static demo fill so the bucket reads as "already holding something" while
// data loads — same two-tone treatment and proportions as the live bucket on
// the Commitment Points page (see TeamBucket in app/(app)/wallet/page.tsx).
const LOADER_PLAN_FILL_HEIGHT = 68;
const LOADER_ACTION_FILL_HEIGHT = 40;
const LOADER_PLAN_FILL_TOP = 249 - LOADER_PLAN_FILL_HEIGHT;
const LOADER_TOTAL_FILL_TOP = LOADER_PLAN_FILL_TOP - LOADER_ACTION_FILL_HEIGHT;

/** Three coins fall into the bucket mouth on a staggered loop, landing on the fill with a ripple. */
function WalletBucketLoader() {
  return (
    <svg className="page-loader__bucket" viewBox="0 0 280 300" role="img" aria-hidden="true">
      <defs>
        <clipPath id="pageLoaderBucketClip">
          <path d="M50 78 L230 78 L207 249 Q140 273 73 249 Z" />
        </clipPath>
        <radialGradient id="pageLoaderCoinGrad" cx="34%" cy="28%" r="75%">
          <stop offset="0%" stopColor="#fff6b8" />
          <stop offset="42%" stopColor="#ffce00" />
          <stop offset="100%" stopColor="#b8860b" />
        </radialGradient>
      </defs>

      <path d="M72 80 Q140 5 208 80" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" opacity=".95" />
      <path d="M50 78 L230 78 L207 249 Q140 273 73 249 Z" fill="#332d34" stroke="#fff" strokeWidth="6" strokeLinejoin="round" />

      <g clipPath="url(#pageLoaderBucketClip)">
        <rect x="45" y={LOADER_PLAN_FILL_TOP} width="190" height={LOADER_PLAN_FILL_HEIGHT + 18} fill="#f3ae45" />
      </g>
      <g clipPath="url(#pageLoaderBucketClip)">
        <rect x="45" y={LOADER_TOTAL_FILL_TOP} width="190" height={LOADER_ACTION_FILL_HEIGHT + 2} fill="#ffce00" />
      </g>
      <g clipPath="url(#pageLoaderBucketClip)">
        <path
          d={`M45 ${LOADER_TOTAL_FILL_TOP + 3} Q76 ${LOADER_TOTAL_FILL_TOP - 7} 107 ${LOADER_TOTAL_FILL_TOP + 3} T169 ${LOADER_TOTAL_FILL_TOP + 3} T235 ${LOADER_TOTAL_FILL_TOP + 3} L235 ${LOADER_TOTAL_FILL_TOP + 15} L45 ${LOADER_TOTAL_FILL_TOP + 15} Z`}
          fill="#ffda33"
        />
      </g>

      <g aria-hidden="true">
        {[-24, 0, 24].map((dx, i) => (
          <g key={dx} transform={`translate(${140 + dx} 0)`}>
            <g className="wallet-bucket-coin" style={{ animationDelay: `${i * 0.85}s` }}>
              <ellipse cx="0" cy="14" rx="8.5" ry="8.5" fill="url(#pageLoaderCoinGrad)" stroke="#fff0a2" strokeWidth="1.3" />
              <circle cx="0" cy="14" r="5.4" fill="none" stroke="rgba(120,85,0,.4)" strokeWidth="1" />
              <ellipse cx="-2.6" cy="11" rx="2.2" ry="1.4" fill="rgba(255,255,255,.65)" />
            </g>
          </g>
        ))}
      </g>

      <g clipPath="url(#pageLoaderBucketClip)" aria-hidden="true">
        {[-24, 0, 24].map((dx, i) => (
          <g key={dx} transform={`translate(${140 + dx} ${LOADER_TOTAL_FILL_TOP})`}>
            <g className="wallet-bucket-splash" style={{ animationDelay: `${i * 0.85}s` }}>
              <ellipse cx="0" cy="0" rx="13" ry="4.5" className="wallet-bucket-splash-ring" />
              <circle cx="-6" cy="-3" r="1.5" className="wallet-bucket-splash-spark" />
              <circle cx="7" cy="-4" r="1.2" className="wallet-bucket-splash-spark" />
              <circle cx="1" cy="-6" r="1.1" className="wallet-bucket-splash-spark" />
            </g>
          </g>
        ))}
      </g>
    </svg>
  );
}

/**
 * Viewport-locked loading state: blurred backdrop, plus a themed centerpiece
 * (a magnifier sweeping a row of files, scanning shown inside its own lens,
 * or coins dropping into the Commitment Bank bucket). Position is fixed to
 * the visible area so tab switches don't push the centerpiece into the
 * wrong place.
 */
export default function PageLoader({ label, sublabel, variant = "fullscreen", theme = "default" }: PageLoaderProps) {
  const resolvedLabel = label ?? (theme === "wallet" ? "Transferring to your Commitment Points" : undefined);
  return (
    <div
      className={`page-loader page-loader--${variant}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="page-loader__content">
        {theme === "wallet" ? <WalletBucketLoader /> : <SearchScanLoader />}
        {resolvedLabel ? <p className="page-loader__label">{resolvedLabel}</p> : null}
        {sublabel ? <p className="page-loader__sublabel">{sublabel}</p> : null}
        <span className="sr-only">{[resolvedLabel, sublabel].filter(Boolean).join(" — ") || "Loading"}</span>
      </div>
    </div>
  );
}
