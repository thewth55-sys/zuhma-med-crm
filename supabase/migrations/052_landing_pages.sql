-- ============================================================
-- 052_landing_pages.sql — landing page builder (Puck editor)
--
--   - One row per account (unique account_id) — a clinic gets one
--     published landing page for the MVP, matching the "Landing de
--     especialidad" (singular) line item already on /pricing for
--     Starter/Pro. Multi-page support is a straightforward later
--     relaxation of the unique constraint, not a redesign.
--   - `slug` is its own public URL namespace (/site/[slug]),
--     deliberately independent from `accounts.public_booking_slug`
--     (migration 051) — two different public surfaces, no reason to
--     force a clinic to reuse the same word for both today.
--   - `content` stores Puck's Data shape ({content: [...], root:
--     {...}}) verbatim — the app never parses into it, just passes
--     it straight to Puck's `<Render>`.
--   - `tier` records which component config (basic vs full — see
--     src/lib/landing-builder/puck-config.tsx) built the page: basic
--     tier is self-serve (the doctor, Settings → Mi página), premium
--     is built by Zentro's internal design team from the
--     platform-admin editor. The public render route always uses
--     fullConfig (a superset), so this column is for UI/reporting,
--     not a rendering gate.
--
-- RLS
--   Admin+ of the owning account can read/write their own row
--   (mirrors every other settings-class table in this schema). No
--   public SELECT policy — the public render route
--   (/site/[slug]) always goes through the service-role client and
--   additionally checks `published = true` in application code, so
--   there's nothing for RLS to add there. Zentro staff editing on
--   behalf of a Starter/Pro account also goes through the
--   service-role client via /api/platform-admin/**, gated by
--   requirePlatformAdmin() rather than a DB policy (same pattern as
--   every other platform-admin surface).
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS landing_pages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  slug        text UNIQUE,
  content     jsonb NOT NULL DEFAULT '{}'::jsonb,
  tier        text NOT NULL DEFAULT 'basic' CHECK (tier IN ('basic', 'premium')),
  published   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_landing_pages_slug
  ON landing_pages(slug) WHERE slug IS NOT NULL;

ALTER TABLE landing_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS landing_pages_select ON landing_pages;
CREATE POLICY landing_pages_select ON landing_pages FOR SELECT
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS landing_pages_insert ON landing_pages;
CREATE POLICY landing_pages_insert ON landing_pages FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS landing_pages_update ON landing_pages;
CREATE POLICY landing_pages_update ON landing_pages FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS landing_pages_delete ON landing_pages;
CREATE POLICY landing_pages_delete ON landing_pages FOR DELETE
  USING (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON landing_pages;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON landing_pages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
