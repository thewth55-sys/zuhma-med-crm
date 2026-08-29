// Minimal service worker — exists ONLY to satisfy Chrome/Android's PWA
// installability check (a registered SW with a fetch handler is one of
// the required criteria alongside the manifest). Deliberately does NOT
// cache or intercept anything: this app already has a carefully-tuned
// Cache-Control strategy (see next.config.ts) to avoid serving stale
// HTML with dead chunk-hash references after a deploy; a caching SW
// would fight that. `respondWith` is intentionally never called, so
// every request just falls through to the network as normal.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // No-op: let the browser handle every request natively.
});
