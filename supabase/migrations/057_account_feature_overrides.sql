-- ============================================================
-- 057_account_feature_overrides.sql — per-account force-enable/
-- force-disable of a GatedFeature, independent of plan.
--
-- Design notes
--   - jsonb keyed by GatedFeature (src/lib/billing-platform/features.ts):
--     {"automations": false} forces it off even on a plan that would
--     normally include it; a feature simply absent from the object
--     falls back to the plan default. No migration needed to add a
--     new feature later — the app-side union type is the only source
--     of truth for valid keys.
--   - No RLS policy change needed: accounts already has a SELECT
--     policy letting members read their own row (existing columns
--     like `plan` prove this), and RLS is row- not column-level, so
--     the new column is covered automatically. Writes go through
--     /api/platform-admin/accounts/[accountId]/feature-overrides via
--     the service-role client, same as every other admin write.
--   - Same caveat as the existing plan-based gating this augments
--     (see plan-gate.tsx's own comment): this is a UI-level gate, not
--     a security boundary — none of automations/ai_autoreply/
--     whatsapp_inbox/broadcasts/landing_builder currently have a
--     server-side plan check on their API routes either. Blocking a
--     feature here hides it from the account's nav/UI; it doesn't by
--     itself stop a direct API call. Flagged as a follow-up, not
--     solved by this migration.
-- ============================================================

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS feature_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;
