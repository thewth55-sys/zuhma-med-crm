-- ============================================================
-- 056_account_tags_and_notes.sql — internal-only labels and notes on
-- accounts, for the /admin Cuenta 360 panel.
--
-- Design notes
--   - No separate "tags" master table (unlike the tenant-facing
--     `tags`/`contact_tags` pair in 001_initial_schema.sql) — this is
--     a handful of platform staff labeling a few hundred accounts,
--     not end users tagging thousands of contacts. Free-text `label`
--     per row is enough; the admin UI can still offer autocomplete
--     from `SELECT DISTINCT label FROM account_tags` without a
--     master table forcing that shape.
--   - Same posture as platform_admin_audit_log (041): RLS on, a
--     SELECT policy via is_platform_admin() for any future
--     client-side read, but no INSERT/UPDATE/DELETE policy — writes
--     only happen through /api/platform-admin/** via the
--     service-role client.
-- ============================================================

CREATE TABLE IF NOT EXISTS account_tags (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, label)
);

CREATE INDEX IF NOT EXISTS idx_account_tags_account ON account_tags(account_id);

ALTER TABLE account_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_tags_select ON account_tags;
CREATE POLICY account_tags_select ON account_tags FOR SELECT
  USING (is_platform_admin());

CREATE TABLE IF NOT EXISTS account_notes (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id       UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  author_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  body             TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_notes_account ON account_notes(account_id, created_at DESC);

ALTER TABLE account_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_notes_select ON account_notes;
CREATE POLICY account_notes_select ON account_notes FOR SELECT
  USING (is_platform_admin());
