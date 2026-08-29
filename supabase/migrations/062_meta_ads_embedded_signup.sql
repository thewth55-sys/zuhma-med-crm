-- ============================================================
-- 062_meta_ads_embedded_signup.sql
--
-- Adds the two columns the direct Meta Ads / CAPI connection needs on
-- top of the existing meta_pixel_id/meta_access_token (036): which ad
-- account the auto-discovered pixel belongs to (useful context in the
-- UI, and needed if an account ever has more than one ad account to
-- choose from), and when the granted access token expires, if Meta's
-- response included an expiry — the config_id-driven "Login for
-- Business" exchange (same primitive as WhatsApp Embedded Signup)
-- typically doesn't expire the token the way a plain OAuth login
-- would, but the column exists so a reconnect-reminder cron has
-- something to check if that ever isn't the case.
-- ============================================================

ALTER TABLE conversion_tracking_config
  ADD COLUMN IF NOT EXISTS meta_ad_account_id text,
  ADD COLUMN IF NOT EXISTS meta_token_expires_at timestamptz;
