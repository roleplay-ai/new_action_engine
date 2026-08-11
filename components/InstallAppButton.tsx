"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { usePwaInstall } from "@/lib/use-pwa-install";

/** Persistent "install app" button for the login screen — unlike the
 * one-time home-screen popup, this stays visible every visit (there's no
 * "seen it" state for someone who isn't logged in yet). Renders nothing if
 * the browser hasn't offered an install prompt (already installed, or an
 * unsupported browser). */
export default function InstallAppButton({ className }: { className?: string }) {
  const { canInstall, promptInstall } = usePwaInstall();
  const [installing, setInstalling] = useState(false);

  if (!canInstall) return null;

  async function handleClick() {
    setInstalling(true);
    try {
      await promptInstall();
    } finally {
      setInstalling(false);
    }
  }

  return (
    <button type="button" className={className ?? "login-install-button"} onClick={() => void handleClick()} disabled={installing}>
      <Download size={16} />
      {installing ? "Installing…" : "Install app"}
    </button>
  );
}
