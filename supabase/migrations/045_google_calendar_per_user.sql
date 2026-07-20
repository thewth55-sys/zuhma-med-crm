-- ============================================================
-- 045_google_calendar_per_user.sql — moves Google Calendar connection
-- from `doctors` to `profiles` (any team member, not just a linked
-- doctor) and adds a join table so ONE appointment can mirror into
-- MANY connected users' calendars.
--
-- Design notes
--   - The doctors.google_calendar_* columns (037) assumed one
--     calendar per appointment (the assigned doctor's). Widening
--     "who can connect" to any account member breaks that 1:1 —
--     a receptionist connecting wants to see the WHOLE clinic
--     schedule, not just appointments for a doctor they may not even
--     be. So appointments.google_calendar_event_id (037) is retired
--     in favor of appointment_google_events, one row per (appointment,
--     connected user) pair holding that user's own Google event id.
--   - doctors.google_calendar_* columns are left in place rather than
--     dropped — nothing in production ever populated them (the
--     feature only just shipped code, no live connections exist yet)
--     — but the app no longer reads or writes them after this.
--   - RLS on appointment_google_events mirrors appointments' own:
--     readable/writable by members of the appointment's account.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS google_calendar_connected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS google_calendar_id text,
  ADD COLUMN IF NOT EXISTS google_refresh_token text,
  ADD COLUMN IF NOT EXISTS google_calendar_connected_at timestamptz;

CREATE TABLE IF NOT EXISTS appointment_google_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_event_id text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (appointment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_appointment_google_events_appointment
  ON appointment_google_events(appointment_id);
CREATE INDEX IF NOT EXISTS idx_appointment_google_events_user
  ON appointment_google_events(user_id);

ALTER TABLE appointment_google_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Account members can view appointment google events" ON appointment_google_events;
CREATE POLICY "Account members can view appointment google events"
  ON appointment_google_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.id = appointment_google_events.appointment_id
        AND is_account_member(a.account_id, 'viewer')
    )
  );

DROP POLICY IF EXISTS "Account members can manage appointment google events" ON appointment_google_events;
CREATE POLICY "Account members can manage appointment google events"
  ON appointment_google_events FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.id = appointment_google_events.appointment_id
        AND is_account_member(a.account_id, 'agent')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.id = appointment_google_events.appointment_id
        AND is_account_member(a.account_id, 'agent')
    )
  );
