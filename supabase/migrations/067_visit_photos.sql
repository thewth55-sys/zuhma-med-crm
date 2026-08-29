-- ============================================================
-- 067_visit_photos.sql — durable clinical photo history per patient.
--
-- Design notes
--   - Keyed off `patient_profile_id`: this is clinical data scoped to
--     converted patients, not raw WhatsApp leads.
--   - `appointment_id` is optional — a photo can be tied to the visit
--     it was taken during, but isn't required to (kept simple for
--     this version: staff just upload with an optional caption,
--     ordered by `created_at`, rather than being forced to pick a
--     specific appointment every time).
--   - The `clinical-photos` bucket is PRIVATE (unlike chat-media/
--     flow-media/landing-media, all public) — this is patient medical
--     imagery, not a WhatsApp attachment or a marketing asset. Reads
--     go through short-lived signed URLs (createSignedUrl), never a
--     public URL. Path convention adds a patient segment on top of
--     the account-scoped one those other buckets use:
--       clinical-photos/account-<account_id>/patient-<patient_profile_id>/<timestamp>-<basename>.<ext>
--
-- RLS: any account member reads, agent+ writes.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS visit_photos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  patient_profile_id  uuid NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
  appointment_id      uuid REFERENCES appointments(id) ON DELETE SET NULL,
  storage_path        text NOT NULL,
  caption             text,
  uploaded_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visit_photos_patient ON visit_photos(patient_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_visit_photos_account ON visit_photos(account_id);

ALTER TABLE visit_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS visit_photos_select ON visit_photos;
CREATE POLICY visit_photos_select ON visit_photos FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS visit_photos_insert ON visit_photos;
CREATE POLICY visit_photos_insert ON visit_photos FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS visit_photos_update ON visit_photos;
CREATE POLICY visit_photos_update ON visit_photos FOR UPDATE
  USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS visit_photos_delete ON visit_photos;
CREATE POLICY visit_photos_delete ON visit_photos FOR DELETE
  USING (is_account_member(account_id, 'agent'));

-- ============================================================
-- clinical-photos storage bucket — PRIVATE (public = FALSE)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'clinical-photos',
  'clinical-photos',
  FALSE,
  8388608, -- 8 MB — clinical photos only, tighter than chat-media's 16 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Reads (including createSignedUrl, which checks SELECT permission
-- under the hood) are account-scoped, NOT public — same predicate
-- shape as chat-media's write policies (023), applied here to SELECT
-- too since this bucket is private.
DROP POLICY IF EXISTS "Members can read clinical photos" ON storage.objects;
CREATE POLICY "Members can read clinical photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'clinical-photos'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "Members can upload clinical photos" ON storage.objects;
CREATE POLICY "Members can upload clinical photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'clinical-photos'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "Members can delete clinical photos" ON storage.objects;
CREATE POLICY "Members can delete clinical photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'clinical-photos'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );
