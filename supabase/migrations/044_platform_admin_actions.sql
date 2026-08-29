-- ============================================================
-- 044_platform_admin_actions.sql — adds 'suspended' as a distinct
-- subscription_status value.
--
-- Design notes
--   - 'canceled' already means "no longer paying" (customer choice or
--     subscription lifecycle ending) and already puts the account in
--     read-only mode via hasActiveAccess(). 'suspended' is a separate,
--     administrative lock — a platform admin stepping in (abuse,
--     non-payment enforcement outside Stripe's own dunning, etc.) —
--     kept distinct so the two are never conflated in the UI or in
--     the audit trail (a suspended account shouldn't read as "they
--     canceled on their own").
--   - hasActiveAccess() (lib/billing-platform/plans.ts) already
--     excludes anything outside ('trialing','active','past_due') by
--     construction — no code change needed there, 'suspended' falls
--     into read-only automatically once the TS union type is widened
--     alongside this migration.
-- ============================================================

ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_subscription_status_check;

ALTER TABLE accounts
  ADD CONSTRAINT accounts_subscription_status_check
  CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'canceled', 'trial_expired', 'suspended'));
