-- ============================================================
-- 092_platform_staff_roles.sql — granular roles for internal Zuhma
-- staff (`platform_admins`), starting with just enough to gate the
-- Marketing content-approval admin panel. Ported from zentro-med —
-- this is about STAFF permissions, not customer/account gating, so
-- it doesn't conflict with "every account has full, equal access".
--
-- Design notes
--   - `role` defaults every EXISTING platform admin to 'global' —
--     preserves today's behavior. New staff invited going forward
--     can be given a narrower role.
--   - 6 possible values from day one; only 'marketing' (+ 'global',
--     which always bypasses) is actually enforced anywhere right now.
--
-- Idempotente — seguro correr varias veces.
-- ============================================================

ALTER TABLE platform_admins
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'global';

ALTER TABLE platform_admins
  DROP CONSTRAINT IF EXISTS platform_admins_role_check;
ALTER TABLE platform_admins
  ADD CONSTRAINT platform_admins_role_check
    CHECK (role IN ('global', 'support', 'dev', 'qa', 'customer_success', 'marketing'));
