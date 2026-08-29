"use client";

import { fireGoogleAdsConversion } from "@/lib/conversions/gtag";
import type { ConversionEvent } from "@/lib/conversions/events";

interface TrackConversionData {
  phone?: string;
  email?: string;
  dealValue?: number;
  dealCurrency?: string;
}

/**
 * Fire-and-forget client helper for the two events that only ever
 * happen via a direct client-side Supabase write (manual "Add
 * Contact", "Mark as Won") — call right after that write succeeds.
 *
 * POSTs to /api/conversions/track, which dispatches Meta CAPI
 * server-side and returns the Google Ads {conversionId, label} (if
 * configured) so this fires the gtag beacon in the same round trip.
 * Never throws — a tracking failure must never surface as a UI error
 * for the CRM action that triggered it.
 */
export function trackConversion(event: ConversionEvent, data: TrackConversionData = {}): void {
  void fetch("/api/conversions/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, ...data }),
  })
    .then((res) => res.json())
    .then((payload) => {
      const googleAds = payload?.google_ads;
      if (googleAds?.conversionId && googleAds?.label) {
        void fireGoogleAdsConversion(googleAds.conversionId, googleAds.label);
      }
    })
    .catch((err) => {
      console.error("[conversions] trackConversion failed:", err);
    });
}
