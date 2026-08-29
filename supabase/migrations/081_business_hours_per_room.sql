-- ============================================================
-- 081_business_hours_per_room.sql
--
-- Horarios POR CONSULTORIO (ubicación). Un cliente puede tener varios
-- consultorios (cada uno con su dirección) y cada uno define su propio
-- horario de servicio. Antes business_hours era a nivel cuenta; ahora se
-- ancla a un consultorio (rooms).
--
-- Migración de datos: los horarios generales existentes (room_id NULL) se
-- copian a CADA consultorio de la cuenta para no perder la configuración,
-- y luego se eliminan las filas generales.
--
-- Idempotente.
-- ============================================================

ALTER TABLE business_hours
  ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES rooms(id) ON DELETE CASCADE;

-- Backfill: replica cada horario general a todos los consultorios de su cuenta.
INSERT INTO business_hours (account_id, room_id, weekday, open_time, close_time)
SELECT bh.account_id, r.id, bh.weekday, bh.open_time, bh.close_time
FROM business_hours bh
JOIN rooms r ON r.account_id = bh.account_id
WHERE bh.room_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM business_hours x
    WHERE x.account_id = bh.account_id AND x.room_id = r.id
      AND x.weekday = bh.weekday AND x.open_time = bh.open_time AND x.close_time = bh.close_time
  );

-- Elimina las filas generales (ya no se usan: el horario es por consultorio).
DELETE FROM business_hours WHERE room_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_business_hours_room ON business_hours(account_id, room_id, weekday);
