-- ============================================================
-- 036_conversion_tracking_config.sql — Meta CAPI + Google Ads
-- conversion tracking config (Settings → Conversions tab)
--
-- Design notes
--   - `conversion_tracking_config` is account-scoped and
--     UNIQUE(account_id) — one config per workspace, same shape as
--     `ai_configs` / `whatsapp_config`.
--   - `meta_access_token` is a long-lived Meta System User token used
--     server-side to POST events to the Conversions API. We need the
--     plaintext at call time, so it's AES-256-GCM-encrypted at rest
--     (same `encrypt()`/`decrypt()` as `whatsapp_config.access_token`
--     / `ai_configs.api_key`) and never returned to the client after
--     save.
--   - Explicit boolean per-event columns (not JSONB) — the event set
--     is small and fixed by the product surface (contact created,
--     deal won, first reply, automations step), matching the
--     `ai_configs` precedent over a schemaless blob.
--   - Google Ads is gtag-only (no OAuth Ads API) — just a Conversion
--     ID + a Conversion Label per event type, fired client-side. No
--     secret involved, so plaintext text columns are fine. There's no
--     `google_ads_automations` label: that step runs server-side
--     inside the automation engine with no browser present, so gtag
--     can never fire there.
--
-- RLS
--   Settings-class, mirroring `ai_configs` / `whatsapp_config`: any
--   member (viewer+) may read it, only admin+ may create/update/delete.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS conversion_tracking_config (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                      uuid NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  created_by                      uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Meta Conversions API
  meta_pixel_id                   text,
  meta_access_token               text,                 -- AES-256-GCM-encrypted
  meta_test_event_code            text,
  meta_track_lead_created         boolean NOT NULL DEFAULT false,
  meta_track_deal_won             boolean NOT NULL DEFAULT false,
  meta_track_first_reply          boolean NOT NULL DEFAULT false,
  meta_track_automations          boolean NOT NULL DEFAULT false,

  -- Google Ads (gtag, no OAuth)
  google_ads_conversion_id        text,
  google_ads_lead_created_label   text,
  google_ads_deal_won_label       text,
  google_ads_first_reply_label    text,

  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE conversion_tracking_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversion_tracking_config_select ON conversion_tracking_config;
CREATE POLICY conversion_tracking_config_select ON conversion_tracking_config FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS conversion_tracking_config_insert ON conversion_tracking_config;
CREATE POLICY conversion_tracking_config_insert ON conversion_tracking_config FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS conversion_tracking_config_update ON conversion_tracking_config;
CREATE POLICY conversion_tracking_config_update ON conversion_tracking_config FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS conversion_tracking_config_delete ON conversion_tracking_config;
CREATE POLICY conversion_tracking_config_delete ON conversion_tracking_config FOR DELETE
  USING (is_account_member(account_id, 'admin'));

-- Keep updated_at fresh on every write.
CREATE OR REPLACE FUNCTION public.update_conversion_tracking_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS conversion_tracking_config_updated_at ON conversion_tracking_config;
CREATE TRIGGER conversion_tracking_config_updated_at
  BEFORE UPDATE ON conversion_tracking_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_conversion_tracking_config_updated_at();
