-- ============================================================
-- 048_profile_nav_order.sql — lets each user reorder their own
-- sidebar navigation, at their own discretion (not an account-wide
-- setting — a receptionist and a doctor may want different orders).
--
-- Design notes
--   - `nav_order` is a jsonb array of nav item hrefs, e.g.
--     '["/agenda", "/dashboard", "/inbox", ...]'. Nullable: null (the
--     default for everyone) means "use the app's default order" — no
--     backfill needed, and it lets the app add/reorder default nav
--     items later without silently overriding anyone's saved
--     preference (only items present in nav_order get repositioned;
--     anything else keeps appending at its default-order position).
--   - Lives on `profiles`, not `accounts` — same one-preference-per-
--     person model as `google_calendar_connected` (045).
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS nav_order jsonb;
