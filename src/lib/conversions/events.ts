/**
 * Conversion-tracking event vocabulary — the CRM moments that can
 * fire a Meta CAPI event and/or a Google Ads gtag conversion.
 *
 * Adding an event here is a two-step change: add the id, then add the
 * matching `meta_track_*` / `google_ads_*_label` columns in a new
 * migration (see 036_conversion_tracking_config.sql) plus the mapping
 * entries in `dispatch.ts`.
 *
 * The automations "send_conversion_event" step is a separate,
 * free-form Meta-only path (src/lib/automations/engine.ts) — it isn't
 * part of this fixed vocabulary because its Meta event name is
 * user-supplied per automation, and it has no Google Ads equivalent
 * (that step runs server-side, with no browser to fire gtag from).
 */

export const CONVERSION_EVENTS = ["lead_created", "deal_won", "first_reply"] as const;

export type ConversionEvent = (typeof CONVERSION_EVENTS)[number];
