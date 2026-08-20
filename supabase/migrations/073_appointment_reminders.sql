-- ============================================================
-- 073_appointment_reminders.sql — recordatorios de cita 24h antes.
--
-- Un cron (pg_cron) llama a /api/appointment-reminders/cron cada ~15 min;
-- ese endpoint busca citas que entran a la ventana de 24h y aún no se han
-- recordado, y notifica al usuario que agendó (created_by) y al médico
-- asignado (doctors.user_id) por correo + notificación in-app (que a su
-- vez dispara el push FCM por el trigger push_on_new_notification).
--
--   - `reminder_24h_sent_at` en appointments marca la cita como recordada
--     (dedup: no se envía dos veces).
--   - Se amplía el CHECK de `notifications.type` para permitir el nuevo
--     tipo 'appointment_reminder'.
--
-- Idempotente.
-- ============================================================

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS reminder_24h_sent_at timestamptz;

-- Índice parcial para que el cron encuentre rápido las citas pendientes.
CREATE INDEX IF NOT EXISTS idx_appointments_reminder_due
  ON appointments(start_at) WHERE reminder_24h_sent_at IS NULL;

-- Ampliar los tipos permitidos de notificación.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('conversation_assigned', 'appointment_reminder'));
