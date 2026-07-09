"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      if (error.message.toLowerCase().includes("email logins are disabled")) {
        setError(
          "Email logins are disabled in Supabase. Enable them: Dashboard → Authentication → Providers → Email → Enable."
        );
      } else {
        setError(error.message);
      }
      return;
    }
    window.location.href = "/";
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* ── Left: Brand panel ── */}
      <div
        className="hidden lg:flex lg:w-[44%] flex-col justify-between p-14"
        style={{ background: "var(--color-bg-dark)" }}
      >
        <div>
          {/* Logo */}
          <div className="flex items-center mb-14">
            <img
              src="/NudgeableBlack.png"
              alt="Nudgeable"
              style={{ height: 64, width: "auto", filter: "brightness(0) invert(1)" }}
            />
          </div>

          <h2
            className="text-4xl xl:text-5xl font-bold leading-tight mb-6 max-w-md"
            style={{ color: "var(--white)", lineHeight: "var(--leading-tight)" }}
          >
            Bridge the Knowing–Doing Gap
          </h2>
          <p
            className="text-lg font-medium max-w-sm"
            style={{ color: "rgba(255,255,255,0.5)", lineHeight: "var(--leading-relaxed)" }}
          >
            Turn behavioral insights into repeatable micro-actions. Schedule, validate, and stay on track with reminders.
          </p>

          {/* Feature list */}
          <ul className="feature-list mt-10" style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.1)" }}>
            {[
              "Develop skills through concrete micro-actions",
              "Get AI-generated actions tailored to your training",
              "Track progress with the behavioral funnel",
            ].map((text) => (
              <li key={text} className="feature-list__item">
                <span className="feature-list__bullet" />
                <span style={{ color: "rgba(255,255,255,0.7)" }}>{text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Dot decorations */}
        <div className="flex gap-3">
          <div className="w-3 h-3 rounded-full" style={{ background: "var(--bright-amber)" }} />
          <div className="w-3 h-3 rounded-full" style={{ background: "var(--dodger-blue)" }} />
          <div className="w-3 h-3 rounded-full" style={{ background: "rgba(255,255,255,0.2)" }} />
        </div>
      </div>

      {/* ── Right: Form ── */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="card w-full animate-fade-up" style={{ maxWidth: "440px" }}>
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <img src="/icon.png" alt="Nudgeable" style={{ height: 36, width: "auto" }} />
          </div>

          <div className="flex justify-center mb-4">
            <img src="/icon.png" alt="Nudgeable" style={{ height: 56, width: "auto" }} />
          </div>
          <h1 className="card__title text-center">Welcome back</h1>
          <p className="card__subtitle text-center">Sign in to continue your growth journey.</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="form-group mb-0">
              <label htmlFor="email" className="form-label">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
                className="form-input"
                placeholder="you@company.com"
                suppressHydrationWarning
              />
            </div>

            <div className="form-group mb-0">
              <label htmlFor="password" className="form-label">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="form-input pr-12"
                  placeholder="••••••••"
                  suppressHydrationWarning
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="btn btn--icon absolute right-2 top-1/2 -translate-y-1/2"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  suppressHydrationWarning
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="card__inset flex items-start gap-3"
                style={{ borderColor: "var(--color-danger)", background: "rgba(237,69,81,0.08)" }}
              >
                <div
                  className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                  style={{ background: "var(--color-danger)" }}
                />
                <p className="text-sm font-semibold" style={{ color: "var(--color-danger)" }}>
                  {error}
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn btn--primary btn--full btn--lg mt-2"
              suppressHydrationWarning
            >
              {loading ? (
                <>
                  <span
                    className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
                    style={{ borderColor: "var(--color-text-primary)", borderTopColor: "transparent" }}
                  />
                  Signing in…
                </>
              ) : (
                "Sign in →"
              )}
            </button>
          </form>

          <p className="text-center text-xs mt-6" style={{ color: "var(--color-text-muted)" }}>
            Need access? Contact your administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
