-- ============================================================
-- 068_open_plan_unlimited_patients.sql — Zuhma Med CRM has a single
-- open plan with no tiers, offered as a free value-add to Zuhma's own
-- clients (not a paid SaaS product like the zentro-med fork this
-- codebase started from). There is no plan to look up a limit from
-- anymore, so the per-plan patient cap introduced in 049 and carried
-- forward in 064 is removed entirely — every account gets unlimited
-- patients.
--
-- Kept as a trigger (rather than dropping it outright) only so the
-- function name stays stable for anything that still references it;
-- it is now a pure no-op pass-through.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_patient_limit()
RETURNS TRIGGER AS $$
BEGIN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
