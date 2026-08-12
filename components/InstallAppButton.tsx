"use client";

import { useState } from "react";
import { Download, X } from "lucide-react";
import { usePwaInstall } from "@/lib/use-pwa-install";
import IosInstallSteps from "@/components/IosInstallSteps";

/** Persistent "install app" button for the login screen — unlike the
 * one-time home-screen popup, this stays visible every visit (there's no
 * "seen it" state for someone who isn't logged in yet). Renders nothing if
 * the browser hasn't offered an install prompt and isn't iOS (already
 * installed, or an unsupported browser). */
export default function InstallAppButton({ className }: { className?: string }) {
  const { canInstall, needsIosInstructions, promptInstall } = usePwaInstall();
  const [installing, setInstalling] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  if (!canInstall) return null;

  async function handleClick() {
    if (needsIosInstructions) {
      setShowIosHelp(true);
      return;
    }
    setInstalling(true);
    try {
      await promptInstall();
    } finally {
      setInstalling(false);
    }
  }

  return (
    <>
      <button type="button" className={className ?? "login-install-button"} onClick={() => void handleClick()} disabled={installing}>
        <Download size={16} />
        {installing ? "Installing…" : "Install app"}
      </button>

      {showIosHelp ? (
        <div className="ios-install-sheet" role="dialog" aria-modal="true" aria-labelledby="ios-install-title">
          <div className="ios-install-sheet-backdrop" onClick={() => setShowIosHelp(false)} />
          <div className="ios-install-sheet-panel">
            <button type="button" className="ios-install-sheet-close" onClick={() => setShowIosHelp(false)} aria-label="Dismiss">
              <X size={16} />
            </button>
            <strong id="ios-install-title">Install on iPhone</strong>
            <p>Add Nudgeable to your home screen for one-tap access.</p>
            <IosInstallSteps />
            <button type="button" className="ios-install-sheet-done" onClick={() => setShowIosHelp(false)}>
              Got it
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
