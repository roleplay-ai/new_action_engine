"use client";

import { useEffect, useState } from "react";
import { X, Download } from "lucide-react";
import { usePwaInstall } from "@/lib/use-pwa-install";
import IosInstallSteps from "@/components/IosInstallSteps";

const STORAGE_KEY = "nudgeable-install-popup-shown";

/** One-time "install the app" popup for the home screen. Shows at most once
 * ever per browser (tracked in localStorage) — dismissing it in any way
 * (Install, Got it, Not now, or the close button) marks it seen for good. */
export default function InstallAppPopup() {
  const { canInstall, needsIosInstructions, promptInstall } = usePwaInstall();
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!canInstall) return;
    let alreadyShown = true;
    try {
      alreadyShown = localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      // Storage unavailable (private browsing, etc.) — err on the side of
      // not nagging the user every visit.
    }
    if (!alreadyShown) setVisible(true);
  }, [canInstall]);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Ignore — worst case it can show again next visit.
    }
  }

  async function handleInstall() {
    setInstalling(true);
    try {
      await promptInstall();
    } finally {
      setInstalling(false);
      dismiss();
    }
  }

  if (!visible) return null;

  return (
    <div className="install-popup" role="dialog" aria-modal="false" aria-labelledby="install-popup-title">
      <button type="button" className="install-popup-close" onClick={dismiss} aria-label="Dismiss">
        <X size={16} />
      </button>
      <span className="install-popup-icon" aria-hidden="true">
        <img src="/icon-192.png" alt="" width={40} height={40} />
      </span>
      <div className="install-popup-copy">
        <strong id="install-popup-title">Install Nudgeable</strong>
        <span>Add it to your home screen for one-tap access.</span>
      </div>
      {needsIosInstructions ? (
        <>
          <IosInstallSteps className="ios-install-steps install-popup-ios-steps" />
          <div className="install-popup-actions">
            <button type="button" className="install-popup-install" onClick={dismiss}>
              Got it
            </button>
          </div>
        </>
      ) : (
        <div className="install-popup-actions">
          <button type="button" className="install-popup-dismiss" onClick={dismiss}>
            Not now
          </button>
          <button type="button" className="install-popup-install" onClick={() => void handleInstall()} disabled={installing}>
            <Download size={14} />
            {installing ? "Installing…" : "Install"}
          </button>
        </div>
      )}
    </div>
  );
}
