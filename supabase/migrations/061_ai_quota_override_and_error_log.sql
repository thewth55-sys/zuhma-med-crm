-- ============================================================
-- 061_ai_quota_override_and_error_log.sql
--
-- Two independent additions, both for the /admin platform-admin panel:
--
--   1. Per-account AI quota overrides on `accounts`:
--      - `ai_access_blocked` — a hard kill switch a platform admin can
--        flip regardless of plan (abuse, non-payment, etc.). Distinct
--        from the plan's token cap so the UI/API can tell "blocked by
--        staff" from "hit your plan's monthly limit" apart.
--      - `ai_token_limit_override` — when set (including 0), replaces
--        PLAN_CONFIG[plan].aiTokenLimitMonthly for this account only
--        (lib/ai/quota.ts). Null means "use the plan default."
--
--   2. `integration_errors` — a durable, admin-readable log of
--      account-facing integration failures (Meta send errors, AI
--      dispatch failures) that today only ever hit console.error and
--      vanish. Mirrors platform_admin_audit_log's RLS shape: written
--      exclusively via the service-role client (no INSERT policy for
--      any session role), read-only for platform admins.
-- ============================================================

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS ai_access_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_token_limit_override integer;

CREATE TABLE IF NOT EXISTS integration_errors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- e.g. 'whatsapp_send', 'ai_auto_reply'.
  source TEXT NOT NULL,
  -- Machine code when the failure has one (e.g. Meta's numeric error
  -- code like 131037), free text otherwise.
  code TEXT,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integration_errors_account_created
  ON integration_errors(account_id, created_at DESC);

ALTER TABLE integration_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS integration_errors_select ON integration_errors;
CREATE POLICY integration_errors_select ON integration_errors FOR SELECT
  USING (is_platform_admin());
