-- ============================================================
-- 040_platform_billing.sql — Zentro Med SaaS layer: plans,
-- subscription lifecycle, platform admins
--
-- Design notes
--   - `accounts` gets a `plan`/`subscription_status` pair instead of
--     a single field, mirroring how `appointments.status` and
--     `invoices.status` are already modeled in this schema —
--     `plan` answers "what did they buy", `subscription_status`
--     answers "is that purchase currently in good standing". Kept
--     orthogonal on purpose: a `zentro_salud_pro` account can be
--     `past_due` without silently becoming a different plan.
--   - Every account starts in `plan='trial'` — the existing signup
--     trigger (`handle_new_user()`, 017_account_sharing.sql:659-689)
--     needs no change: it already creates the `accounts` row with no
--     explicit `plan`, so the new column's DEFAULT applies for free.
--   - `included_seats` defaults to 2 (the number of team members a
--     trial/standalone/bundle account gets before extra-seat billing
--     kicks in) — a plain integer, not derived from `plan`, because
--     a manual comp/override (a platform admin granting extra seats
--     without a Stripe line item) should be possible without a
--     special-cased plan value.
--   - `portal_client_id` links an account to its matching `clients.id`
--     row in the separate Zentro Labs Portal (different repo, PHP/
--     MySQL) — nullable because most trial signups will never go
--     through the Portal at all. Populated at SSO hand-off time
--     (Fase C), not here.
--   - `platform_admins` is deliberately NOT scoped by `account_id` —
--     it's an orthogonal, platform-wide role, unlike
--     `account_role_enum` which only means something inside one
--     account. A platform admin belongs to Zentro Med itself, not to
--     any single clinic's account.
--   - No RLS changes on any existing business table (contacts,
--     appointments, invoices, etc.) — the super-admin panel reads
--     across accounts exclusively through server-side routes using
--     the `service_role` client (already the pattern for anything
--     that needs to bypass RLS in this codebase), gated by
--     `requirePlatformAdmin()` in application code. Keeping RLS
--     itself untouched means this migration can't accidentally widen
--     what a normal account member can see.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ------------------------------------------------------------
-- accounts — plan + subscription lifecycle
-- ------------------------------------------------------------
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'trial';

ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_plan_check;
ALTER TABLE accounts
  ADD CONSTRAINT accounts_plan_check
  CHECK (plan IN ('trial', 'standalone', 'zentro_salud_starter', 'zentro_salud_pro'));

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'trialing';

ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_subscription_status_check;
ALTER TABLE accounts
  ADD CONSTRAINT accounts_subscription_status_check
  CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'canceled', 'trial_expired'));

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days');

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS included_seats INTEGER NOT NULL DEFAULT 2;

ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_included_seats_check;
ALTER TABLE accounts
  ADD CONSTRAINT accounts_included_seats_check
  CHECK (included_seats >= 0);

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS portal_client_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_stripe_customer
  ON accounts(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_stripe_subscription
  ON accounts(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_accounts_portal_client
  ON accounts(portal_client_id) WHERE portal_client_id IS NOT NULL;

-- ------------------------------------------------------------
-- platform_admins — orthogonal to account_role_enum (see notes above)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_admins (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

-- A user may check whether THEY are a platform admin (so the UI can
-- decide whether to render the "/admin" nav link) — nothing else.
-- Granting/revoking platform-admin status happens out of band (direct
-- SQL via the Supabase console at launch, or a future internal-only
-- endpoint) — deliberately not exposed as a normal INSERT/DELETE the
-- app can reach, since this table controls access to every tenant's
-- data.
DROP POLICY IF EXISTS platform_admins_select_self ON platform_admins;
CREATE POLICY platform_admins_select_self ON platform_admins FOR SELECT
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform_admins WHERE user_id = auth.uid()
  );
$$;
