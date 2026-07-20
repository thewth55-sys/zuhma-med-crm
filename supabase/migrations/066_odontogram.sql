-- ============================================================
-- 066_odontogram.sql — per-tooth current status chart for a
-- converted patient.
--
-- Design notes
--   - Keyed off `patient_profile_id` (like clinical_notes), not
--     `contact_id` directly — the odontogram is a clinical artifact,
--     scoped to actual patients (038's "a contact becomes a patient
--     when patient_profiles is created"), not raw WhatsApp leads.
--   - One row per (patient_profile_id, tooth_number) holding the
--     CURRENT status — not a history log. Changing a tooth's
--     condition upserts this row; there's no per-change audit trail
--     here (unlike clinical_notes' hard immutability) since a chart
--     is meant to be edited as treatment progresses, same posture as
--     patient_profiles' own freely-editable fields.
--   - FDI/ISO two-digit numbering (11-18, 21-28, 31-38, 41-48),
--     permanent adult dentition only — 32 possible rows per patient.
--     Primary/deciduous teeth are out of scope for this version.
--
-- RLS mirrors patient_profiles: any account member reads, agent+
-- writes (create/update/delete) — no immutability trigger, this is a
-- current-state chart, not a legal record like clinical_notes.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS odontogram_teeth (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  patient_profile_id  uuid NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
  tooth_number        smallint NOT NULL CHECK (
    tooth_number IN (
      11,12,13,14,15,16,17,18,
      21,22,23,24,25,26,27,28,
      31,32,33,34,35,36,37,38,
      41,42,43,44,45,46,47,48
    )
  ),
  condition           text NOT NULL DEFAULT 'healthy' CHECK (
    condition IN ('healthy','caries','filled','crown','root_canal','missing','extraction_planned','implant','bridge')
  ),
  notes               text,
  updated_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (patient_profile_id, tooth_number)
);

CREATE INDEX IF NOT EXISTS idx_odontogram_teeth_patient ON odontogram_teeth(patient_profile_id);
CREATE INDEX IF NOT EXISTS idx_odontogram_teeth_account ON odontogram_teeth(account_id);

ALTER TABLE odontogram_teeth ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS odontogram_teeth_select ON odontogram_teeth;
CREATE POLICY odontogram_teeth_select ON odontogram_teeth FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS odontogram_teeth_insert ON odontogram_teeth;
CREATE POLICY odontogram_teeth_insert ON odontogram_teeth FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS odontogram_teeth_update ON odontogram_teeth;
CREATE POLICY odontogram_teeth_update ON odontogram_teeth FOR UPDATE
  USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS odontogram_teeth_delete ON odontogram_teeth;
CREATE POLICY odontogram_teeth_delete ON odontogram_teeth FOR DELETE
  USING (is_account_member(account_id, 'agent'));

DROP TRIGGER IF EXISTS set_updated_at ON odontogram_teeth;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON odontogram_teeth
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
