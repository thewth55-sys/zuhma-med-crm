-- ============================================================
-- 089_whatsapp_config_app_secret.sql — per-account Meta App Secret
--
-- Why this exists:
--   Inbound WhatsApp webhooks are signed by Meta with the App Secret of
--   the Meta app that owns the WABA, and verified via HMAC-SHA256
--   (x-hub-signature-256). The platform historically verified EVERY
--   inbound request against a single global `META_APP_SECRET` env var —
--   correct for the shared-app / Embedded Signup model where every
--   client's number lives under the platform's own Meta app.
--
--   But a clinic that brings its OWN Meta app (its own WABA + own token)
--   sends webhooks signed with ITS app secret, which the global secret
--   can't verify → every inbound POST is rejected and no messages reach
--   the inbox. This column lets such an account store its own app secret
--   (encrypted, AES-256-GCM, same as access_token) so the webhook can
--   verify that account's inbound against the right key.
--
--   The webhook still tries the global `META_APP_SECRET` first (covers
--   all Embedded Signup accounts with zero config); it only falls back
--   to this per-account secret when the global one doesn't match, after
--   resolving the account by the payload's phone_number_id / WABA id.
--
--   Nullable: Embedded-Signup accounts leave it empty and behave exactly
--   as before. Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS app_secret TEXT;

COMMENT ON COLUMN whatsapp_config.app_secret IS
  'Encrypted (AES-256-GCM) Meta App Secret for accounts using their OWN Meta app (BYO WABA). NULL for Embedded Signup accounts, which verify inbound webhooks against the global META_APP_SECRET.';
