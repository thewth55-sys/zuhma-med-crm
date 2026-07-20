-- ============================================================
-- 060_ai_agenda_access.sql — lets an account opt its AI auto-reply
-- assistant into real agenda access (check availability + book an
-- appointment as a tool call), on top of the existing text-only
-- assistant. Off by default, same posture as auto_reply_enabled.
--
-- Widens appointments.source so bookings the AI creates are
-- distinguishable from a staff member's manual entry or the public
-- booking widget — same reasoning as 051_public_booking.sql adding
-- 'public_booking' alongside 'cal_com'/'manual'.
-- ============================================================

ALTER TABLE ai_configs
  ADD COLUMN IF NOT EXISTS agenda_access_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_source_check;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_source_check
  CHECK (source IN ('cal_com', 'manual', 'public_booking', 'ai_agent'));
