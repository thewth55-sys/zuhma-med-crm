-- ============================================================
-- 055_platform_admin_team.sql — audit context for platform_admins.
--
-- 040_platform_billing.sql deliberately left platform_admins
-- grant/revoke "out of band ... a future internal-only endpoint" —
-- this migration is that endpoint's only schema dependency: knowing
-- who invited whom. No RLS change (still select-self only; the new
-- /api/platform-admin/team/** routes read/write through the
-- service-role client like every other platform-admin route, gated
-- by requirePlatformAdmin() in application code).
-- ============================================================

ALTER TABLE platform_admins
  ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
