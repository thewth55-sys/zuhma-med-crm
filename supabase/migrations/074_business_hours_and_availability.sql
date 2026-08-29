-- ============================================================
-- 074_business_hours_and_availability.sql
--
-- (C) Horario general de la clínica: `business_hours` define las horas y
--     días de servicio a nivel cuenta (ej. Lun–Vie 09:00–18:00). Se usan
--     como base de disponibilidad en la reserva pública: si un médico no
--     tiene bloques declarados ese día, se ofrecen slots dentro del
--     horario de clínica; si sí los tiene, se intersectan con él.
--     Se agrega `accounts.timezone` para interpretar esas horas locales.
--
-- (A) Disponibilidad de médicos gestionable por staff: se amplía la RLS de
--     `doctor_availability_blocks` para que agente+ (agente/admin/owner)
--     pueda crear/editar/borrar los bloques de CUALQUIER médico de la
--     cuenta (antes solo el propio médico dueño del bloque).
--
-- Idempotente.
-- ============================================================

-- (C) Zona horaria de la cuenta (para interpretar business_hours locales).
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Mexico_City';

-- (C) Horas de servicio de la clínica. weekday: 0=domingo … 6=sábado
-- (igual que EXTRACT(DOW) de Postgres y getDay() de JS). Se permiten
-- varias filas por día (turnos partidos, ej. mañana y tarde). La ausencia
-- de filas para un día = cerrado ese día.
CREATE TABLE IF NOT EXISTS business_hours (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  weekday     smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  open_time   time NOT NULL,
  close_time  time NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (close_time > open_time)
);

CREATE INDEX IF NOT EXISTS idx_business_hours_account ON business_hours(account_id, weekday);

ALTER TABLE business_hours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_hours_select ON business_hours;
CREATE POLICY business_hours_select ON business_hours FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS business_hours_modify ON business_hours;
CREATE POLICY business_hours_modify ON business_hours FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

-- (A) Ampliar RLS de doctor_availability_blocks: admin+ OR el médico dueño.
DROP POLICY IF EXISTS doctor_availability_blocks_insert ON doctor_availability_blocks;
CREATE POLICY doctor_availability_blocks_insert ON doctor_availability_blocks FOR INSERT
  WITH CHECK (
    is_account_member(account_id, 'agent')
    OR EXISTS (
      SELECT 1 FROM doctors d
      WHERE d.id = doctor_availability_blocks.doctor_id
        AND d.user_id = auth.uid()
        AND d.account_id = doctor_availability_blocks.account_id
    )
  );

DROP POLICY IF EXISTS doctor_availability_blocks_update ON doctor_availability_blocks;
CREATE POLICY doctor_availability_blocks_update ON doctor_availability_blocks FOR UPDATE
  USING (
    is_account_member(account_id, 'agent')
    OR EXISTS (
      SELECT 1 FROM doctors d
      WHERE d.id = doctor_availability_blocks.doctor_id
        AND d.user_id = auth.uid()
        AND d.account_id = doctor_availability_blocks.account_id
    )
  );

DROP POLICY IF EXISTS doctor_availability_blocks_delete ON doctor_availability_blocks;
CREATE POLICY doctor_availability_blocks_delete ON doctor_availability_blocks FOR DELETE
  USING (
    is_account_member(account_id, 'agent')
    OR EXISTS (
      SELECT 1 FROM doctors d
      WHERE d.id = doctor_availability_blocks.doctor_id
        AND d.user_id = auth.uid()
        AND d.account_id = doctor_availability_blocks.account_id
    )
  );
