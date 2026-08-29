-- ============================================================
-- 058_login_events.sql — per-login IP/browser/device/country trail,
-- for the /admin Cuenta 360 "Sesiones recientes" card.
--
-- Design notes
--   - Written by the signed-in user themselves right after a genuine
--     SIGNED_IN auth event (see the onAuthStateChange hook in
--     use-auth.tsx and POST /api/auth/log-session) — not on every
--     token refresh or page load, and not client-supplied for the
--     user_id (the API route derives it from the authenticated
--     session, never trusts a body field, so a row can't be spoofed
--     to point at a different account).
--   - account_id is a snapshot at insert time (denormalized off
--     profiles.account_id) purely so the admin query can filter by
--     account without a join through profiles, which may no longer
--     reflect the user's CURRENT account if they ever change
--     accounts — acceptable for a historical login trail.
--   - Same posture as account_tags/account_notes: RLS on, admin reads
--     via is_platform_admin(), but the INSERT policy here (unlike
--     those two) allows the row's own user to self-insert — this
--     table's writer is the end user's browser right after login, not
--     a platform-admin action through the service-role client.
-- ============================================================

CREATE TABLE IF NOT EXISTS login_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id  UUID REFERENCES accounts(id) ON DELETE SET NULL,
  ip_address  TEXT,
  user_agent  TEXT,
  browser     TEXT,
  device      TEXT,
  country     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_events_account ON login_events(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_events_user ON login_events(user_id, created_at DESC);

ALTER TABLE login_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS login_events_select ON login_events;
CREATE POLICY login_events_select ON login_events FOR SELECT
  USING (is_platform_admin());

DROP POLICY IF EXISTS login_events_insert_self ON login_events;
CREATE POLICY login_events_insert_self ON login_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);
