"use client";

import { useEffect } from "react";

/** Registers the no-op service worker (public/sw.js) site-wide so the
 * browser considers the app installable — mounted once in the root layout. */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Installability is a nice-to-have — never let this break the page.
      });
    }
  }, []);

  return null;
}
