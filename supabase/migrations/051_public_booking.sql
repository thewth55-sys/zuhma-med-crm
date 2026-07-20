-- ============================================================
-- 051_public_booking.sql — native public booking widget
-- ("Agenda de citas online 24/7", already on every /pricing tier
-- including the free trial).
--
--   - accounts.public_booking_slug: the URL segment for
--     /agendar/[slug]. Nullable — null means "not published yet".
--     Globally unique (it's a public URL namespace, not scoped to
--     the account), lowercase/dash-only enforced in the API layer
--     (slugify), not by a CHECK here — keeps the constraint simple
--     and the friendly-error path in application code.
--   - accounts.public_booking_enabled: separate from having a slug
--     so an account can pause the public page without losing/
--     reissuing their URL.
--   - appointments.source gains 'public_booking' alongside the
--     existing 'cal_com' (unused — see migration 037's Phase B
--     comment, being wired up in migration 053) and 'manual'.
--
-- The public booking API routes run entirely through the
-- service-role client (no end-user session exists for an anonymous
-- visitor), so no new RLS policy is needed here — same posture as
-- the WhatsApp webhook.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS public_booking_slug text,
  ADD COLUMN IF NOT EXISTS public_booking_enabled boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_public_booking_slug
  ON accounts(public_booking_slug) WHERE public_booking_slug IS NOT NULL;

ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_source_check;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_source_check
  CHECK (source IN ('cal_com', 'manual', 'public_booking'));
