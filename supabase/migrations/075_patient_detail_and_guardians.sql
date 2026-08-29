-- ============================================================
-- 075_patient_detail_and_guardians.sql
--
-- Enriquece la ficha del paciente (paridad con Zuhma Med) y agrega el
-- modelo de RESPONSABLE/TUTOR como entidad reutilizable:
--
-- (A) contacts: nombre partido + campos de identidad/captación, con un
--     trigger que mantiene `contacts.name` sincronizado (los flujos que
--     solo escriben `name` —alta rápida, webhook de WhatsApp, import CSV—
--     siguen intactos).
--
-- (B) patient_profiles: campos administrativos/clínicos ricos
--     (documento, nacimiento, historia clínica, sexo, aseguradora,
--     ocupación, línea de negocio, grupo).
--
-- (C) guardians (responsables) + patient_guardians (vínculo N:M): un
--     responsable puede vincularse a VARIOS pacientes (padre/madre/tutor
--     en pediatría; dueño en veterinaria).
--
-- Idempotente.
-- ============================================================

-- (A) contacts: nombre partido + captación --------------------
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS first_name     text,
  ADD COLUMN IF NOT EXISTS last_name      text,
  ADD COLUMN IF NOT EXISTS nickname       text,
  ADD COLUMN IF NOT EXISTS landline_phone text,
  ADD COLUMN IF NOT EXISTS address        text,
  ADD COLUMN IF NOT EXISTS lead_source    text;

-- Mantiene contacts.name = "first_name last_name" cuando cambian los
-- campos partidos, SIN pisar a quien escribe solo `name` (alta rápida,
-- webhook de WhatsApp, import). El resto de la app sigue leyendo `name`.
CREATE OR REPLACE FUNCTION sync_contact_name()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.first_name IS DISTINCT FROM OLD.first_name)
     OR (NEW.last_name IS DISTINCT FROM OLD.last_name)
     OR (TG_OP = 'INSERT' AND (NEW.first_name IS NOT NULL OR NEW.last_name IS NOT NULL))
  THEN
    NEW.name := NULLIF(trim(concat_ws(' ', NEW.first_name, NEW.last_name)), '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_contact_name_trigger ON contacts;
CREATE TRIGGER sync_contact_name_trigger
  BEFORE INSERT OR UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION sync_contact_name();

-- (B) patient_profiles: campos ricos --------------------------
ALTER TABLE patient_profiles
  ADD COLUMN IF NOT EXISTS document_type      text,
  ADD COLUMN IF NOT EXISTS document_number    text,
  ADD COLUMN IF NOT EXISTS birth_date         date,
  ADD COLUMN IF NOT EXISTS birth_country      text,
  ADD COLUMN IF NOT EXISTS hc_number          text,
  ADD COLUMN IF NOT EXISTS insurance_provider text,
  ADD COLUMN IF NOT EXISTS business_line      text,
  ADD COLUMN IF NOT EXISTS patient_group      text,
  ADD COLUMN IF NOT EXISTS occupation         text,
  ADD COLUMN IF NOT EXISTS sex                text;

-- (C) Responsables (entidad reutilizable) ---------------------
CREATE TABLE IF NOT EXISTS guardians (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id      uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name            text NOT NULL,
  phone           text,
  email           text,
  document_type   text,
  document_number text,
  address         text,
  notes           text,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guardians_account ON guardians(account_id);

-- Vínculo N:M paciente(contacto) ↔ responsable. `relationship` vive en
-- el vínculo porque una misma persona puede ser "madre" de un paciente y
-- "dueña" de otro. `is_primary` marca el responsable principal.
CREATE TABLE IF NOT EXISTS patient_guardians (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id   uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id   uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  guardian_id  uuid NOT NULL REFERENCES guardians(id) ON DELETE CASCADE,
  relationship text,
  is_primary   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, guardian_id)
);

CREATE INDEX IF NOT EXISTS idx_patient_guardians_contact  ON patient_guardians(contact_id);
CREATE INDEX IF NOT EXISTS idx_patient_guardians_guardian ON patient_guardians(guardian_id);

DROP TRIGGER IF EXISTS set_updated_at ON guardians;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON guardians
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: mismo patrón que contacts (lee cualquier miembro, escribe agente+).
ALTER TABLE guardians         ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_guardians ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS guardians_select ON guardians;
CREATE POLICY guardians_select ON guardians FOR SELECT USING (is_account_member(account_id));
DROP POLICY IF EXISTS guardians_insert ON guardians;
CREATE POLICY guardians_insert ON guardians FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
DROP POLICY IF EXISTS guardians_update ON guardians;
CREATE POLICY guardians_update ON guardians FOR UPDATE USING (is_account_member(account_id, 'agent'));
DROP POLICY IF EXISTS guardians_delete ON guardians;
CREATE POLICY guardians_delete ON guardians FOR DELETE USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS patient_guardians_select ON patient_guardians;
CREATE POLICY patient_guardians_select ON patient_guardians FOR SELECT USING (is_account_member(account_id));
DROP POLICY IF EXISTS patient_guardians_insert ON patient_guardians;
CREATE POLICY patient_guardians_insert ON patient_guardians FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
DROP POLICY IF EXISTS patient_guardians_update ON patient_guardians;
CREATE POLICY patient_guardians_update ON patient_guardians FOR UPDATE USING (is_account_member(account_id, 'agent'));
DROP POLICY IF EXISTS patient_guardians_delete ON patient_guardians;
CREATE POLICY patient_guardians_delete ON patient_guardians FOR DELETE USING (is_account_member(account_id, 'agent'));
