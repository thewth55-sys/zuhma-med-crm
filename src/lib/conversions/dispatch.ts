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
import {
  uploadClickConversion,
  retractConversion,
  gAdsDateTime,
  type GoogleAdsCreds,
} from "@/lib/conversions/google-ads-api";

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
  // Los eventos de pipeline no se envían a Meta (isMetaEventEnabled=false);
  // estas entradas sólo satisfacen la exhaustividad del Record.
  lead_qualified: "Lead",
  lead_disqualified: "Lead",
};

function isMetaEventEnabled(cfg: ConversionTrackingConfigRow, event: ConversionEvent): boolean {
  switch (event) {
    case "lead_created":
      return cfg.meta_track_lead_created;
    case "deal_won":
      return cfg.meta_track_deal_won;
    case "first_reply":
      return cfg.meta_track_first_reply;
    case "lead_qualified":
    case "lead_disqualified":
      return false; // sólo Google Ads (ECL server-side), sin Meta
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
    case "lead_qualified":
    case "lead_disqualified":
      return null; // usan la API ECL (server-side), no el gtag por label
  }
}

export interface DispatchConversionEventData {
  phone?: string;
  email?: string;
  dealValue?: number;
  dealCurrency?: string;
  /** orderId (= event_id del navegador) para retractar el Lead en Google Ads. */
  orderId?: string;
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
  // Meta CAPI (best-effort). No corta el flujo: los eventos de pipeline
  // no van a Meta pero sí deben llegar a Google Ads más abajo.
  try {
    const { data: cfg } = await db
      .from("conversion_tracking_config")
      .select(
        "meta_pixel_id, meta_access_token, meta_test_event_code, meta_track_lead_created, meta_track_deal_won, meta_track_first_reply, google_ads_conversion_id, google_ads_lead_created_label, google_ads_deal_won_label, google_ads_first_reply_label"
      )
      .eq("account_id", accountId)
      .maybeSingle<ConversionTrackingConfigRow>();

    if (cfg && isMetaEventEnabled(cfg, event) && cfg.meta_pixel_id && cfg.meta_access_token) {
      const accessToken = decrypt(cfg.meta_access_token);
      await sendMetaConversionEvent({
        pixelId: cfg.meta_pixel_id,
        accessToken,
        eventName: META_EVENT_NAMES[event],
        testEventCode: cfg.meta_test_event_code ?? undefined,
        userData: { phone: data.phone, email: data.email },
        customData: event === "deal_won" ? { value: data.dealValue, currency: data.dealCurrency } : undefined,
      });
    }
  } catch (err) {
    console.error("[conversions] meta dispatch failed:", err);
  }

  // Google Ads pipeline server-side (ECL / retract). Tiene su propio
  // best-effort dentro de dispatchGoogleAdsPipeline.
  if (event === "deal_won" || event === "lead_qualified" || event === "lead_disqualified") {
    await dispatchGoogleAdsPipeline(db, accountId, event, {
      email: data.email,
      phone: data.phone,
      value: data.dealValue,
      currency: data.dealCurrency,
      orderId: data.orderId,
    });
  }
}

interface GoogleAdsPipelineConfigRow {
  google_ads_track_pipeline: boolean;
  google_ads_developer_token: string | null;
  google_ads_client_id: string | null;
  google_ads_client_secret: string | null;
  google_ads_refresh_token: string | null;
  google_ads_customer_id: string | null;
  google_ads_login_customer_id: string | null;
  google_ads_qualified_action_id: string | null;
  google_ads_won_action_id: string | null;
  google_ads_lead_action_id: string | null;
}

/**
 * Sube (o retracta) la conversión de pipeline a Google Ads vía la API
 * (Enhanced Conversions for Leads). Best-effort: cualquier fallo se
 * registra y se traga, igual que el resto del dispatch.
 */
export async function dispatchGoogleAdsPipeline(
  db: SupabaseClient,
  accountId: string,
  event: "lead_qualified" | "deal_won" | "lead_disqualified",
  data: { email?: string; phone?: string; value?: number; currency?: string; orderId?: string }
): Promise<void> {
  try {
    const { data: cfg } = await db
      .from("conversion_tracking_config")
      .select(
        "google_ads_track_pipeline, google_ads_developer_token, google_ads_client_id, google_ads_client_secret, google_ads_refresh_token, google_ads_customer_id, google_ads_login_customer_id, google_ads_qualified_action_id, google_ads_won_action_id, google_ads_lead_action_id"
      )
      .eq("account_id", accountId)
      .maybeSingle<GoogleAdsPipelineConfigRow>();

    if (
      !cfg?.google_ads_track_pipeline ||
      !cfg.google_ads_customer_id ||
      !cfg.google_ads_developer_token ||
      !cfg.google_ads_client_id ||
      !cfg.google_ads_client_secret ||
      !cfg.google_ads_refresh_token
    ) {
      return;
    }

    const creds: GoogleAdsCreds = {
      developerToken: decrypt(cfg.google_ads_developer_token),
      clientId: cfg.google_ads_client_id,
      clientSecret: decrypt(cfg.google_ads_client_secret),
      refreshToken: decrypt(cfg.google_ads_refresh_token),
      customerId: cfg.google_ads_customer_id,
      loginCustomerId: cfg.google_ads_login_customer_id ?? undefined,
    };
    const now = gAdsDateTime(new Date());

    if (event === "lead_qualified" && cfg.google_ads_qualified_action_id) {
      await uploadClickConversion(creds, {
        conversionActionId: cfg.google_ads_qualified_action_id,
        email: data.email,
        phone: data.phone,
        value: data.value ?? 0,
        currency: data.currency,
        conversionDateTime: now,
      });
    } else if (event === "deal_won" && cfg.google_ads_won_action_id) {
      await uploadClickConversion(creds, {
        conversionActionId: cfg.google_ads_won_action_id,
        email: data.email,
        phone: data.phone,
        value: data.value ?? 0,
        currency: data.currency,
        conversionDateTime: now,
      });
    } else if (event === "lead_disqualified" && cfg.google_ads_lead_action_id && data.orderId) {
      await retractConversion(creds, {
        conversionActionId: cfg.google_ads_lead_action_id,
        orderId: data.orderId,
        adjustmentDateTime: now,
      });
    }
  } catch (err) {
    console.error("[conversions] google ads pipeline failed:", err);
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
