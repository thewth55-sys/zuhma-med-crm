-- ============================================================
-- 064_patient_limit_on_conversion.sql — plan patient caps now count
-- converted patients (patient_profiles), not raw WhatsApp leads.
--
-- Design notes
--   - Previously (049), the trigger fired on every `contacts` INSERT
--     and counted ALL contacts for the account — meaning any inbound
--     WhatsApp lead consumed the plan's "pacientes activos" quota,
--     even one that never became an actual patient. A contact
--     "becomes" a patient when a `patient_profiles` row is created
--     for it (see 038's own doc comment) — that's the real moment
--     this cap should apply.
--   - This migration drops the old trigger from `contacts` entirely
--     (leads can now flow in without limit) and re-creates the same
--     enforcement on `patient_profiles` INSERT instead, counting
--     patient_profiles rows per account rather than contacts rows.
--   - Same limit numbers as before (must stay in sync with
--     src/lib/billing-platform/plans.ts's `patientLimit`, same
--     tradeoff already accepted by 049).
--
-- Idempotent — safe to run multiple times.
-- ============================================================

DROP TRIGGER IF EXISTS trg_enforce_patient_limit ON contacts;

CREATE OR REPLACE FUNCTION enforce_patient_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_plan text;
  v_limit integer;
  v_count integer;
BEGIN
  SELECT plan INTO v_plan FROM accounts WHERE id = NEW.account_id;

  v_limit := CASE v_plan
    WHEN 'standalone' THEN 1000
    WHEN 'zentro_salud_starter' THEN 5000
    ELSE NULL
  END;

  IF v_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count FROM patient_profiles WHERE account_id = NEW.account_id;
    IF v_count >= v_limit THEN
      RAISE EXCEPTION 'ZENTRO_PATIENT_LIMIT: this account has reached its plan''s patient limit (%)', v_limit;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_enforce_patient_limit ON patient_profiles;
CREATE TRIGGER trg_enforce_patient_limit
  BEFORE INSERT ON patient_profiles
  FOR EACH ROW EXECUTE FUNCTION enforce_patient_limit();
