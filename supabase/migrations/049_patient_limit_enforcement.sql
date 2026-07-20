-- ============================================================
-- 049_patient_limit_enforcement.sql — enforces the per-plan patient
-- (contact) cap from the /pricing page server-side, at the DB layer.
--
-- Design notes
--   - Contacts are inserted from several places (the add-patient form,
--     CSV import, the public v1 API) and none of them go through a
--     single shared server route — a BEFORE INSERT trigger is the one
--     place that reliably sees every path, RLS-bypass-proof (a
--     technically savvy user calling the REST API directly can't skip
--     this the way a client-side-only check could be skipped).
--   - The limit numbers here intentionally duplicate
--     src/lib/billing-platform/plans.ts's `patientLimit` field rather
--     than reading it from anywhere dynamic — same tradeoff already
--     accepted by `accounts_subscription_status_check` (044) mirroring
--     the TS `SubscriptionStatus` union. If /pricing's numbers change,
--     both this trigger and plans.ts need updating together.
--   - trial and zentro_salud_pro are uncapped (NULL) — trial because
--     its real constraint is the 30-day window, not volume; pro
--     because "Pacientes ilimitados" is one of its selling points.
--   - The exception message is prefixed with a stable marker
--     (ZENTRO_PATIENT_LIMIT) so the app can detect this specific
--     failure and show an upgrade prompt instead of a raw DB error —
--     see contact-form.tsx.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

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
    SELECT COUNT(*) INTO v_count FROM contacts WHERE account_id = NEW.account_id;
    IF v_count >= v_limit THEN
      RAISE EXCEPTION 'ZENTRO_PATIENT_LIMIT: this account has reached its plan''s patient limit (%)', v_limit;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_enforce_patient_limit ON contacts;
CREATE TRIGGER trg_enforce_patient_limit
  BEFORE INSERT ON contacts
  FOR EACH ROW EXECUTE FUNCTION enforce_patient_limit();
