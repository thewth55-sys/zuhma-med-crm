-- ============================================================
-- 041_platform_admin_audit_log.sql — audit trail for platform-admin
-- actions (Fase D: the /admin super-admin panel)
--
-- Design notes
--   - Impersonation ("act as this account's owner to configure their
--     WhatsApp/Meta Conversions settings") is a genuine capability, not
--     a UI trick — the platform admin ends up with a real Supabase
--     session as the target user. That's exactly the kind of access
--     that needs a durable, admin-readable trail of who did it, to
--     whom, and when. This table is that trail; today it only ever
--     gets an 'impersonate' row, but `action` is free text so future
--     platform-admin actions (e.g. manually comping seats) can log
--     into the same table without a schema change.
--   - Written exclusively via the service-role client from
--     `POST /api/platform-admin/accounts/[accountId]/impersonate`
--     (mirrors `platform_admins` itself: no INSERT policy for regular
--     sessions, because this table's integrity matters more than any
--     legitimate use case for a client-side write).
--   - `ON DELETE SET NULL` everywhere rather than CASCADE — a deleted
--     user or account shouldn't erase the historical record that an
--     impersonation happened.
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_admin_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_email TEXT,
  action TEXT NOT NULL,
  target_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_admin_audit_log_created
  ON platform_admin_audit_log(created_at DESC);

ALTER TABLE platform_admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Read-only for platform admins; no INSERT/UPDATE/DELETE policy for
-- any role — writes only happen via the service-role client, which
-- bypasses RLS entirely.
DROP POLICY IF EXISTS platform_admin_audit_log_select ON platform_admin_audit_log;
CREATE POLICY platform_admin_audit_log_select ON platform_admin_audit_log FOR SELECT
  USING (is_platform_admin());
