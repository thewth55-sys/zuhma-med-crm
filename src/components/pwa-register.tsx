"use client";

import { useEffect } from "react";

/**
 * Registers public/sw.js — a deliberately no-op service worker that
 * exists only to satisfy Chrome/Android's PWA installability check
 * (see that file's header comment for why it doesn't cache anything).
 * Renders nothing; this is pure side-effect-on-mount.
 */
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("Service worker registration failed:", err);
      });
    }
  }, []);

  return null;
}
