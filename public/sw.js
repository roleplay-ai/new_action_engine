// Minimal service worker — exists only to satisfy PWA installability
// requirements (Chrome/Edge/Android require a fetch handler to fire
// `beforeinstallprompt`). It deliberately does NOT cache anything: this is
// an authenticated, frequently-changing app, and stale cached pages/data
// would be worse than no offline support at all. Every request just passes
// straight through to the network.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // No-op: let the browser handle the request normally.
});
