-- ============================================================
-- 054_cal_com_per_account_secret.sql
--
-- Fixes a cross-tenant forgery hole in the Cal.com webhook receiver
-- (src/app/api/integrations/cal-com/webhook/[accountId]/route.ts):
-- every account on the deployment verified inbound webhooks against
-- the SAME shared CAL_COM_WEBHOOK_SECRET env var, while `accountId`
-- itself came unauthenticated from the URL path. Anyone who knew (or
-- was given, for their own legitimate Cal.com integration) that one
-- secret could forge a valid signature for ANY other account's URL
-- and create/cancel/reschedule appointments in a tenant they don't
-- belong to.
--
-- Each account now gets its own random secret, generated server-side
-- so it's never guessable and never round-trips through the client.
-- `gen_random_uuid()` is Postgres core (13+) — no pgcrypto extension
-- dependency — so two concatenated UUIDs give 256 bits of randomness
-- per account, matching the entropy this codebase already uses for
-- account_invitations tokens.
--
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS cal_com_webhook_secret text
    NOT NULL DEFAULT (
      replace(gen_random_uuid()::text, '-', '') ||
      replace(gen_random_uuid()::text, '-', '')
    );

COMMENT ON COLUMN accounts.cal_com_webhook_secret IS
  'Per-account HMAC secret for the Cal.com inbound webhook '
  '(src/app/api/integrations/cal-com/webhook/[accountId]/route.ts). '
  'Set this as the webhook signing secret in Cal.com → Settings → '
  'Developer → Webhooks for this account. Replaces the old shared '
  'CAL_COM_WEBHOOK_SECRET env var, which is no longer read.';
