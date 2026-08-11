"use client";

import { useCallback, useEffect, useState } from "react";

/** Chrome/Edge/Android fire this instead of letting the browser show its own
 * install UI, so the site can offer its own "Install" button/popup and
 * trigger the native prompt on demand. Not part of lib.dom.d.ts. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari's own flag — there's no beforeinstallprompt there, but this
    // keeps the button/popup from showing once a user has already added it.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Drives both the one-time home-screen popup and the login-screen install
 * button off a single shared listener for the browser's install prompt. */
export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());

    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }
    function onAppInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return "unavailable" as const;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return outcome;
  }, [deferredPrompt]);

  return {
    /** True once the browser has told us installing is possible right now. */
    canInstall: !installed && !!deferredPrompt,
    installed,
    promptInstall,
  };
}
