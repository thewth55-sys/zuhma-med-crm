-- ============================================================
-- 071_google_ads_api.sql
--
-- Google Ads server-side — Enhanced Conversions for Leads (ECL).
--
-- Amplía conversion_tracking_config con las credenciales de la API de
-- Google Ads y los ids de las acciones de conversión del pipeline
-- (calificado / paciente / lead-para-retract). El developer token, el
-- client secret y el refresh token se guardan CIFRADOS (mismo encrypt()
-- que meta_access_token). Es aparte del path gtag (google_ads_conversion_id
-- + *_label), que sigue siendo client-side.
--
-- En contacts se guarda google_order_id (= event_id del navegador) para
-- poder retractar la conversión Lead de un lead descalificado.
-- ============================================================

ALTER TABLE conversion_tracking_config
  ADD COLUMN IF NOT EXISTS google_ads_developer_token   text,   -- cifrar
  ADD COLUMN IF NOT EXISTS google_ads_client_id          text,
  ADD COLUMN IF NOT EXISTS google_ads_client_secret      text,   -- cifrar
  ADD COLUMN IF NOT EXISTS google_ads_refresh_token       text,   -- cifrar
  ADD COLUMN IF NOT EXISTS google_ads_customer_id         text,   -- solo dígitos
  ADD COLUMN IF NOT EXISTS google_ads_login_customer_id   text,   -- opcional (MCC)
  ADD COLUMN IF NOT EXISTS google_ads_qualified_action_id text,
  ADD COLUMN IF NOT EXISTS google_ads_won_action_id       text,
  ADD COLUMN IF NOT EXISTS google_ads_lead_action_id      text,   -- para RETRACTION
  ADD COLUMN IF NOT EXISTS google_ads_track_pipeline      boolean NOT NULL DEFAULT false;

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS google_order_id text;
