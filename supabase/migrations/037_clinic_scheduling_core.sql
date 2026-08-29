-- ============================================================
-- 037_clinic_scheduling_core.sql — Clinic scheduling module
-- (Phase A: rooms, doctors, service types, appointments — no
-- external integrations yet)
--
-- Design notes
--   - `doctors` is a domain entity, not an `account_role_enum` value.
--     A doctor's schedule/specialty/calendar metadata has nothing to
--     do with app privilege level; `account_role_enum` stays untouched
--     (it's a real Postgres ENUM used as a SQL function parameter
--     type in `is_account_member()` — widening it would ripple into
--     every `hasMinRole`/`roleRank` comparison in the app). A doctor
--     who needs a WACRM login is invited normally (any account_role,
--     typically 'viewer') and an admin links `doctors.user_id` to
--     that member afterward — the two concepts are independent.
--   - Google Calendar columns on `doctors` are added now (nullable,
--     unused until Phase C) rather than in a later migration, so the
--     Settings → Doctors UI and the eventual OAuth connect flow don't
--     need a second ALTER TABLE.
--   - `doctor_availability_blocks` — explicit date/time ranges a
--     doctor declares they'll be at THIS clinic (not a recurring
--     weekly pattern: these doctors split time across multiple
--     clinics/hospitals, so availability is negotiated and declared
--     month to month, not derived from any single calendar).
--   - `appointments.deal_id` links back to the pipeline deal that
--     originated it (nullable — an appointment can exist without a
--     deal, e.g. a walk-in), but appointments are independent bookable
--     entities with their own date/time so one deal/patient can have
--     several appointments over time (follow-ups).
--   - `doctor_id` / `room_id` / `service_type_id` on `appointments`
--     are nullable — created first from a lead (deal/contact only),
--     then assigned manually by staff.
--
-- RLS
--   `rooms`, `service_types`, `appointments`: settings/operational-
--   class, mirroring `conversion_tracking_config` — any member reads,
--   admin+ manages rooms/service types, agent+ manages appointments
--   (staff need to create/update appointments day to day, not just
--   admins).
--   `doctors`: any member reads (needed to populate assignment
--   dropdowns), admin+ writes (including the Google Calendar token
--   columns — those are only ever written by the server-side OAuth
--   callback using the service-role client, so no separate policy
--   needed for them).
--   `doctor_availability_blocks`: SELECT is any member (staff need to
--   see everyone's declared availability to schedule); INSERT/UPDATE/
--   DELETE is restricted to the doctor who owns the block
--   (`doctors.user_id = auth.uid()`) — deliberately NOT gated by
--   account_role/admin bypass, because the whole point is that each
--   doctor self-declares their own availability rather than staff
--   transcribing it for them.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ------------------------------------------------------------
-- doctors
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS doctors (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                    uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id                       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name                          text NOT NULL,
  specialty                     text,
  is_active                     boolean NOT NULL DEFAULT true,

  -- Google Calendar (Phase C; unused until then)
  google_calendar_connected     boolean NOT NULL DEFAULT false,
  google_calendar_id            text,              -- usually 'primary'
  google_refresh_token          text,              -- AES-256-GCM-encrypted
  google_calendar_connected_at  timestamptz,

  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

-- A WACRM login maps to at most one doctor row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_doctors_one_per_user
  ON doctors(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_doctors_account ON doctors(account_id);

ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doctors_select ON doctors;
CREATE POLICY doctors_select ON doctors FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS doctors_insert ON doctors;
CREATE POLICY doctors_insert ON doctors FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS doctors_update ON doctors;
CREATE POLICY doctors_update ON doctors FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS doctors_delete ON doctors;
CREATE POLICY doctors_delete ON doctors FOR DELETE
  USING (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON doctors;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON doctors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- rooms (consultorios)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rooms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name        text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rooms_account ON rooms(account_id);

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rooms_select ON rooms;
CREATE POLICY rooms_select ON rooms FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS rooms_insert ON rooms;
CREATE POLICY rooms_insert ON rooms FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS rooms_update ON rooms;
CREATE POLICY rooms_update ON rooms FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS rooms_delete ON rooms;
CREATE POLICY rooms_delete ON rooms FOR DELETE
  USING (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON rooms;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON rooms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- service_types (tratamientos)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_types (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name               text NOT NULL,
  duration_minutes   integer NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_types_account ON service_types(account_id);

ALTER TABLE service_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_types_select ON service_types;
CREATE POLICY service_types_select ON service_types FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS service_types_insert ON service_types;
CREATE POLICY service_types_insert ON service_types FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS service_types_update ON service_types;
CREATE POLICY service_types_update ON service_types FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS service_types_delete ON service_types;
CREATE POLICY service_types_delete ON service_types FOR DELETE
  USING (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON service_types;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON service_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- doctor_availability_blocks — self-declared monthly availability
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS doctor_availability_blocks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  doctor_id   uuid NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  start_at    timestamptz NOT NULL,
  end_at      timestamptz NOT NULL,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_dab_doctor_range
  ON doctor_availability_blocks(doctor_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_dab_account ON doctor_availability_blocks(account_id);

ALTER TABLE doctor_availability_blocks ENABLE ROW LEVEL SECURITY;

-- Any account member can see everyone's declared blocks — the
-- assistant scheduling a patient needs the full picture.
DROP POLICY IF EXISTS doctor_availability_blocks_select ON doctor_availability_blocks;
CREATE POLICY doctor_availability_blocks_select ON doctor_availability_blocks FOR SELECT
  USING (is_account_member(account_id));

-- Self-service only — the doctor who owns the block, no admin bypass.
DROP POLICY IF EXISTS doctor_availability_blocks_insert ON doctor_availability_blocks;
CREATE POLICY doctor_availability_blocks_insert ON doctor_availability_blocks FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM doctors d
    WHERE d.id = doctor_availability_blocks.doctor_id
      AND d.user_id = auth.uid()
      AND d.account_id = doctor_availability_blocks.account_id
  ));

DROP POLICY IF EXISTS doctor_availability_blocks_update ON doctor_availability_blocks;
CREATE POLICY doctor_availability_blocks_update ON doctor_availability_blocks FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM doctors d
    WHERE d.id = doctor_availability_blocks.doctor_id
      AND d.user_id = auth.uid()
      AND d.account_id = doctor_availability_blocks.account_id
  ));

DROP POLICY IF EXISTS doctor_availability_blocks_delete ON doctor_availability_blocks;
CREATE POLICY doctor_availability_blocks_delete ON doctor_availability_blocks FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM doctors d
    WHERE d.id = doctor_availability_blocks.doctor_id
      AND d.user_id = auth.uid()
      AND d.account_id = doctor_availability_blocks.account_id
  ));

DROP TRIGGER IF EXISTS set_updated_at ON doctor_availability_blocks;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON doctor_availability_blocks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- appointments
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointments (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  deal_id                   uuid REFERENCES deals(id) ON DELETE SET NULL,
  contact_id                uuid REFERENCES contacts(id) ON DELETE SET NULL,
  doctor_id                 uuid REFERENCES doctors(id) ON DELETE SET NULL,
  room_id                   uuid REFERENCES rooms(id) ON DELETE SET NULL,
  service_type_id           uuid REFERENCES service_types(id) ON DELETE SET NULL,
  start_at                  timestamptz NOT NULL,
  end_at                    timestamptz NOT NULL,
  status                    text NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
  source                    text NOT NULL DEFAULT 'manual' CHECK (source IN ('cal_com', 'manual')),
  cal_com_booking_uid       text,              -- Phase B
  google_calendar_event_id  text,              -- Phase C
  notes                     text,
  created_by                uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_cal_com_uid
  ON appointments(cal_com_booking_uid) WHERE cal_com_booking_uid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_account_start ON appointments(account_id, start_at);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_start
  ON appointments(doctor_id, start_at) WHERE doctor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_room_start
  ON appointments(room_id, start_at) WHERE room_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_deal
  ON appointments(deal_id) WHERE deal_id IS NOT NULL;

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appointments_select ON appointments;
CREATE POLICY appointments_select ON appointments FOR SELECT
  USING (is_account_member(account_id));

-- agent+ (not just admin) — day-to-day scheduling is done by regular
-- staff, mirroring how deals/contacts are agent-writable.
DROP POLICY IF EXISTS appointments_insert ON appointments;
CREATE POLICY appointments_insert ON appointments FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS appointments_update ON appointments;
CREATE POLICY appointments_update ON appointments FOR UPDATE
  USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS appointments_delete ON appointments;
CREATE POLICY appointments_delete ON appointments FOR DELETE
  USING (is_account_member(account_id, 'agent'));

DROP TRIGGER IF EXISTS set_updated_at ON appointments;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
