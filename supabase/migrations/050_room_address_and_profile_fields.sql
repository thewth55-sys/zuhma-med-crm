-- ============================================================
-- 050_room_address_and_profile_fields.sql
--
--   - rooms.address: physical address of the exam room, surfaced as
--     the Google Calendar event's `location` when an appointment in
--     that room syncs — see lib/scheduling/google-calendar-sync.ts.
--   - profiles gains title/specialty/license_number: a user's own
--     professional info (as opposed to `doctors.specialty`, which is
--     a separate admin-managed roster of assignable doctors that may
--     or may not have a Zentro Med login). Shown in Settings → Tu
--     perfil; title matches "título" (Dr./Dra./Lic.), license_number
--     matches "cédula profesional / matrícula".
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS address text;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS specialty text,
  ADD COLUMN IF NOT EXISTS license_number text;
