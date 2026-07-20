-- ============================================================
-- 038_clinical_records.sql — EHR Phase 1: patient medical profile
-- + immutable clinical notes
--
-- Design notes
--   - `patient_profiles` extends `contacts` 1:1 (same relationship as
--     `doctors` to `profiles` — a domain extension, not a new
--     identity). A contact "becomes" a patient when this row is
--     created; the WhatsApp/CRM identity stays on `contacts`.
--   - `clinical_notes` is the core EHR record: chief complaint +
--     findings/plan, authored by a doctor, optionally tied to the
--     appointment it was written during. It signs itself at creation
--     (`signed_at` defaults to `now()`) — there's no draft state, per
--     the product decision that a clinical note is a legal record from
--     the moment it's saved, not a document you come back to edit.
--   - IMMUTABILITY IS ENFORCED AT THE DATABASE LEVEL, not just hidden
--     in the UI. The triggers below unconditionally reject any UPDATE
--     or DELETE on `clinical_notes` / `clinical_note_addenda`,
--     regardless of role or which client issues the query (including
--     the service-role client) — this is deliberate defense in depth
--     for a medical-legal record, not a policy that could be
--     bypassed by calling the table from a server route instead of
--     going through RLS. Corrections happen via `clinical_note_addenda`
--     (also immutable) — you append a dated correction, you never
--     rewrite history.
--   - Deleting a clinical note is a data-destruction event with real
--     legal weight (spoliation of a medical record). If a row ever
--     genuinely needs to go (e.g. a right-to-erasure request), that's
--     a manual, audited operator action (temporarily dropping the
--     trigger), not something the app exposes.
--
-- RLS
--   `patient_profiles` mirrors `contacts`: any account member reads,
--   agent+ creates/edits, admin+ deletes (data-removal requests).
--   `clinical_notes` / `clinical_note_addenda` are DELIBERATELY
--   stricter than `contacts` — SELECT requires agent+ (not viewer),
--   since these carry health data (diagnoses, complaints, treatment
--   plans) that not every account role has a need to see. INSERT is
--   agent+. There is intentionally no UPDATE or DELETE policy at all
--   for either table — combined with the hard triggers below, this
--   makes mutation impossible through any path.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ------------------------------------------------------------
-- patient_profiles
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_profiles (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id                  uuid NOT NULL UNIQUE REFERENCES contacts(id) ON DELETE CASCADE,
  assigned_doctor_id          uuid REFERENCES doctors(id) ON DELETE SET NULL,
  blood_type                  text,
  allergies                   text,
  chronic_conditions          text,
  current_medications         text,
  emergency_contact_name      text,
  emergency_contact_phone     text,
  notes                       text,              -- general medical notes, freely editable (unlike clinical_notes)
  created_by                  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_profiles_account ON patient_profiles(account_id);

ALTER TABLE patient_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_profiles_select ON patient_profiles;
CREATE POLICY patient_profiles_select ON patient_profiles FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS patient_profiles_insert ON patient_profiles;
CREATE POLICY patient_profiles_insert ON patient_profiles FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS patient_profiles_update ON patient_profiles;
CREATE POLICY patient_profiles_update ON patient_profiles FOR UPDATE
  USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS patient_profiles_delete ON patient_profiles;
CREATE POLICY patient_profiles_delete ON patient_profiles FOR DELETE
  USING (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON patient_profiles;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON patient_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- clinical_notes — immutable once written
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clinical_notes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  patient_profile_id  uuid NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
  doctor_id           uuid REFERENCES doctors(id) ON DELETE SET NULL,
  appointment_id      uuid REFERENCES appointments(id) ON DELETE SET NULL,
  chief_complaint     text NOT NULL,
  findings_and_plan   text NOT NULL,
  signed_at           timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clinical_notes_patient
  ON clinical_notes(patient_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_account ON clinical_notes(account_id);

ALTER TABLE clinical_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinical_notes_select ON clinical_notes;
CREATE POLICY clinical_notes_select ON clinical_notes FOR SELECT
  USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS clinical_notes_insert ON clinical_notes;
CREATE POLICY clinical_notes_insert ON clinical_notes FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

-- Deliberately no UPDATE / DELETE policy — see header comment. The
-- trigger below is the real enforcement; the missing policy is a
-- second, independent barrier (RLS defaults to deny with no matching
-- policy).

-- ------------------------------------------------------------
-- clinical_note_addenda — corrections append, never overwrite
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clinical_note_addenda (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  clinical_note_id   uuid NOT NULL REFERENCES clinical_notes(id) ON DELETE CASCADE,
  content            text NOT NULL,
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clinical_note_addenda_note
  ON clinical_note_addenda(clinical_note_id, created_at ASC);

ALTER TABLE clinical_note_addenda ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinical_note_addenda_select ON clinical_note_addenda;
CREATE POLICY clinical_note_addenda_select ON clinical_note_addenda FOR SELECT
  USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS clinical_note_addenda_insert ON clinical_note_addenda;
CREATE POLICY clinical_note_addenda_insert ON clinical_note_addenda FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

-- ------------------------------------------------------------
-- Hard immutability trigger — shared by both tables. Runs BEFORE the
-- mutation is applied and unconditionally aborts the transaction, so
-- it can't be worked around by RLS policy changes, a service-role
-- client, or a future API route that forgets to check permissions.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_clinical_record_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'clinical records are immutable — % on % is not permitted; add an addendum instead', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS block_clinical_notes_mutation ON clinical_notes;
CREATE TRIGGER block_clinical_notes_mutation
  BEFORE UPDATE OR DELETE ON clinical_notes
  FOR EACH ROW EXECUTE FUNCTION public.reject_clinical_record_mutation();

DROP TRIGGER IF EXISTS block_clinical_note_addenda_mutation ON clinical_note_addenda;
CREATE TRIGGER block_clinical_note_addenda_mutation
  BEFORE UPDATE OR DELETE ON clinical_note_addenda
  FOR EACH ROW EXECUTE FUNCTION public.reject_clinical_record_mutation();
