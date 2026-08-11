"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import InstallAppButton from "@/components/InstallAppButton";

const JOURNEY_STEPS = [
  {
    label: "Learn",
    description: "Build the insight",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 5.5c3-1.1 5.7-.7 8 1.3v12c-2.3-2-5-2.4-8-1.3z" />
        <path d="M20 5.5c-3-1.1-5.7-.7-8 1.3v12c2.3-2 5-2.4 8-1.3z" />
      </svg>
    ),
  },
  {
    label: "Commit",
    description: "Choose what you'll do",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 3h10v4H7z" />
        <path d="M5 6h14v15H5z" />
        <path d="m8 14 2.2 2.2L16.5 10" />
      </svg>
    ),
  },
  {
    label: "Act",
    description: "Apply it at work",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5 10 17l9-10" />
      </svg>
    ),
  },
  {
    label: "Repeat",
    description: "Turn action into practice",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 7v5h-5" />
        <path d="M4 17v-5h5" />
        <path d="M6.1 8.3A7 7 0 0 1 18.8 9L20 12M4 12l1.2 3A7 7 0 0 0 17.9 15.7" />
      </svg>
    ),
  },
];

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
    if (error) {
      setLoading(false);
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
    <main className="login-page">
      {/* ── Left: story panel ── */}
      <section className="login-story" aria-labelledby="login-journey-title">
        <div className="login-eyebrow">Your development journey</div>

        <div className="login-story-copy">
          <h1 id="login-journey-title">Turn learning into everyday action.</h1>
          <p className="login-lede">Your commitments, actions and progress continue here.</p>

          <div className="login-journey" aria-label="Learn, commit, act, repeat">
            {JOURNEY_STEPS.map((step) => (
              <div className="login-step" key={step.label}>
                <div className="login-dot" aria-hidden="true">{step.icon}</div>
                <div>
                  <strong>{step.label}</strong>
                  <span>{step.description}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Right: sign-in panel ── */}
      <section className="login-signin" aria-labelledby="login-signin-title">
        <div className="login-form-wrap">
          <div className="login-top-row">
            <div className="login-lock-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="10" width="14" height="11" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                <path d="M12 14v3" />
              </svg>
            </div>
            <InstallAppButton />
          </div>

          <h2 id="login-signin-title">Welcome back</h2>
          <p className="login-signin-copy">Sign in with your work credentials to continue your journey.</p>

          <form onSubmit={handleSubmit}>
            <div className="login-field">
              <label htmlFor="email">Work email</label>
              <input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
                autoFocus
                className="login-input"
                placeholder="you@company.com"
                suppressHydrationWarning
              />
            </div>

            <div className="login-field">
              <label htmlFor="password">Password</label>
              <div className="login-password-field">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="login-input"
                  placeholder="Enter your password"
                  suppressHydrationWarning
                />
                <button
                  type="button"
                  className="login-reveal"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                  suppressHydrationWarning
                >
                  {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
            </div>

            <p className="login-support-line">Need help? Email <a href="mailto:team@nudgeable.ai">team@nudgeable.ai</a></p>

            {error && (
              <div className="login-error" role="alert">
                <span />
                <p>{error}</p>
              </div>
            )}

            <button type="submit" className="login-continue" disabled={loading} aria-busy={loading} suppressHydrationWarning>
              {loading && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
              {loading ? "Signing in…" : "Continue"}
            </button>
          </form>

          <p className="login-powered">Powered by <strong>Nudgeable</strong></p>
        </div>
      </section>
    </main>
  );
}
