"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Handles Supabase auth callback (e.g. from magic link / auto-login redirect).
 * Extracts access_token and refresh_token from URL hash, sets session, redirects to dashboard.
 */
export default function AuthCallbackPage() {
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");

  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const params = new URLSearchParams(hash.replace(/^#/, ""));

    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (!accessToken || !refreshToken) {
      setStatus("error");
      return;
    }

    const supabase = createClient();
    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(() => {
        setStatus("done");
        window.location.replace("/");
      })
      .catch(() => {
        setStatus("error");
      });
  }, []);

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center p-8">
          <p className="text-lg font-bold text-slate-800 uppercase">Invalid or expired link</p>
          <a
            href="/login"
            className="mt-4 inline-block text-[#3699FC] font-bold hover:underline"
          >
            Return to login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-[#FFCE00] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm font-bold text-slate-600 uppercase tracking-wider">Signing you in…</p>
      </div>
    </div>
  );
}
