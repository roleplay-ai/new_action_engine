"use client";

import { use, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import PageLoader from "@/components/PageLoader";

/**
 * Handles Supabase auth callback (e.g. from magic link / auto-login redirect).
 * Extracts access_token and refresh_token from URL hash, sets session, redirects to dashboard.
 */
export default function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");
  // Reminder emails' "Mark done" / "Confirm all" links pass through here on
  // their way to /actions?completeAction(s)=…; show the sign-in step of the
  // email-link animation (the actions page shows the "marking done" step).
  // Read from searchParams (not window) so the server-rendered first paint
  // already shows the right animation.
  const { next } = use(searchParams);
  const fromEmailLink = typeof next === "string" && /[?&]completeActions?=/.test(next);

  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const params = new URLSearchParams(hash.replace(/^#/, ""));

    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const requestedNext = new URLSearchParams(window.location.search).get("next");
    const safeNext =
      requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
        ? requestedNext
        : "/";

    if (!accessToken || !refreshToken) {
      setStatus("error");
      return;
    }

    const supabase = createClient();
    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(() => {
        setStatus("done");
        window.location.replace(safeNext);
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

  return <PageLoader label="Signing you in" theme={fromEmailLink ? "email-signin" : "default"} />;
}
