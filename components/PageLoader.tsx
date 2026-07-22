import React from "react";

type PageLoaderProps = {
  /** Optional status text under the dots */
  label?: string;
  /**
   * Where the overlay sits:
   * - main: participant content area (keeps sidebar clear)
   * - admin: admin content area (keeps admin sidebar clear)
   * - fullscreen: entire viewport (auth, etc.)
   */
  variant?: "main" | "admin" | "fullscreen";
};

/**
 * Viewport-locked loading state: blurred backdrop, centered Nudgeable favicon,
 * and bouncing dots. Position is fixed to the visible area so tab switches
 * don't push the favicon into the wrong place.
 */
export default function PageLoader({ label, variant = "fullscreen" }: PageLoaderProps) {
  return (
    <div
      className={`page-loader page-loader--${variant}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="page-loader__content">
        <img
          src="/icon.png"
          alt=""
          className="page-loader__favicon"
          width={72}
          height={72}
        />
        <div className="page-loader__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        {label ? <p className="page-loader__label">{label}</p> : null}
        <span className="sr-only">{label || "Loading"}</span>
      </div>
    </div>
  );
}
