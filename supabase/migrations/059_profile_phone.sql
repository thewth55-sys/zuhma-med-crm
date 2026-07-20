-- ============================================================
-- 059_profile_phone.sql — adds a phone number field to profiles, so
-- the admin panel can display/edit it for internal team members
-- (there was previously no phone column on profiles at all — only on
-- `contacts`, which is the clinic's own patients, a different thing).
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS phone TEXT;
