// ============================================================
// Conversion-tracking dispatch — the entry point every mutation site
// (webhook auto-create, api/v1 routes, send-message, client-triggered
// /api/conversions/track) calls to fire a Meta CAPI event and/or read
// back the Google Ads gtag params for that event.
//
// `dispatchConversionEvent` never throws (same contract as
// `dispatchWebhookEvent` in src/lib/webhooks/deliver.ts) — a
// conversion-tracking failure must never break the CRM action that
// triggered it.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";

import { decrypt } from "@/lib/whatsapp/encryption";
import { sendMetaConversionEvent } from "@/lib/conversions/meta-capi";
import type { ConversionEvent } from "@/lib/conversions/events";

interface ConversionTrackingConfigRow {
  meta_pixel_id: string | null;
  meta_access_token: string | null;
  meta_test_event_code: string | null;
  meta_track_lead_created: boolean;
  meta_track_deal_won: boolean;
  meta_track_first_reply: boolean;
  google_ads_conversion_id: string | null;
  google_ads_lead_created_label: string | null;
  google_ads_deal_won_label: string | null;
  google_ads_first_reply_label: string | null;
}

const META_EVENT_NAMES: Record<ConversionEvent, string> = {
  lead_created: "Lead",
  deal_won: "Purchase",
  first_reply: "Contact",
};

function isMetaEventEnabled(cfg: ConversionTrackingConfigRow, event: ConversionEvent): boolean {
  switch (event) {
    case "lead_created":
      return cfg.meta_track_lead_created;
    case "deal_won":
      return cfg.meta_track_deal_won;
    case "first_reply":
      return cfg.meta_track_first_reply;
  }
}

function googleAdsLabelFor(cfg: ConversionTrackingConfigRow, event: ConversionEvent): string | null {
  switch (event) {
    case "lead_created":
      return cfg.google_ads_lead_created_label;
    case "deal_won":
      return cfg.google_ads_deal_won_label;
    case "first_reply":
      return cfg.google_ads_first_reply_label;
  }
}

export interface DispatchConversionEventData {
  phone?: string;
  email?: string;
  dealValue?: number;
  dealCurrency?: string;
}

/**
 * Fires the Meta CAPI event for `event` (if the account has it
 * enabled and configured). Best-effort — logs and swallows any error
 * so a conversion-tracking outage never breaks the caller's mutation.
 */
export async function dispatchConversionEvent(
  db: SupabaseClient,
  accountId: string,
  event: ConversionEvent,
  data: DispatchConversionEventData = {}
): Promise<void> {
  try {
    const { data: cfg } = await db
      .from("conversion_tracking_config")
      .select(
        "meta_pixel_id, meta_access_token, meta_test_event_code, meta_track_lead_created, meta_track_deal_won, meta_track_first_reply, google_ads_conversion_id, google_ads_lead_created_label, google_ads_deal_won_label, google_ads_first_reply_label"
      )
      .eq("account_id", accountId)
      .maybeSingle<ConversionTrackingConfigRow>();

    if (!cfg || !isMetaEventEnabled(cfg, event) || !cfg.meta_pixel_id || !cfg.meta_access_token) return;

    const accessToken = decrypt(cfg.meta_access_token);
    await sendMetaConversionEvent({
      pixelId: cfg.meta_pixel_id,
      accessToken,
      eventName: META_EVENT_NAMES[event],
      testEventCode: cfg.meta_test_event_code ?? undefined,
      userData: { phone: data.phone, email: data.email },
      customData: event === "deal_won" ? { value: data.dealValue, currency: data.dealCurrency } : undefined,
    });
  } catch (err) {
    console.error("[conversions] dispatch failed:", err);
  }
}

/**
 * Google Ads label lookup for the client to fire `gtag()` with. Never
 * throws; returns null on any error or when unconfigured.
 */
export async function getGoogleAdsConversionParams(
  db: SupabaseClient,
  accountId: string,
  event: ConversionEvent
): Promise<{ conversionId: string; label: string } | null> {
  try {
    const { data: cfg } = await db
      .from("conversion_tracking_config")
      .select(
        "meta_pixel_id, meta_access_token, meta_test_event_code, meta_track_lead_created, meta_track_deal_won, meta_track_first_reply, google_ads_conversion_id, google_ads_lead_created_label, google_ads_deal_won_label, google_ads_first_reply_label"
      )
      .eq("account_id", accountId)
      .maybeSingle<ConversionTrackingConfigRow>();

    if (!cfg?.google_ads_conversion_id) return null;
    const label = googleAdsLabelFor(cfg, event);
    if (!label) return null;
    return { conversionId: cfg.google_ads_conversion_id, label };
  } catch (err) {
    console.error("[conversions] google ads lookup failed:", err);
    return null;
  }
}
