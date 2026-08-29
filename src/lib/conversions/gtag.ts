"use client";

/**
 * Google Ads gtag conversion firing — client-only, lazy-loaded.
 *
 * Deliberately NOT loaded globally from the root layout: most
 * accounts won't configure Google Ads, and loading a third-party
 * script unconditionally for everyone would widen the CSP surface
 * (see next.config.ts) for no benefit. `gtag.js` is injected the
 * first time a conversion actually needs to fire, then reused.
 */

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let loadPromise: Promise<void> | null = null;

function loadGtagScript(conversionId: string): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve) => {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer!.push(args);
    };
    window.gtag("js", new Date());
    window.gtag("config", conversionId);

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(conversionId)}`;
    script.onload = () => resolve();
    script.onerror = () => resolve(); // don't block the caller on a network hiccup
    document.head.appendChild(script);
  });

  return loadPromise;
}

/**
 * Fires a single Google Ads conversion. Safe to call from any client
 * component — no-ops on the server and swallows load failures (a
 * conversion beacon must never break the UI action that triggered it).
 */
export async function fireGoogleAdsConversion(conversionId: string, label: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await loadGtagScript(conversionId);
    window.gtag?.("event", "conversion", { send_to: `${conversionId}/${label}` });
  } catch (err) {
    console.error("[conversions] gtag fire failed:", err);
  }
}
