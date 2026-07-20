-- ============================================================
-- 053_landing_media.sql
--
-- Adds the `landing-media` Supabase Storage bucket so the landing
-- page builder's image fields (Hero, Gallery, DoctorBio) can be a
-- real upload widget instead of a paste-a-URL text box.
--
-- Mirrors `chat-media` (migration 023) / `flow-media` (016/020)
-- exactly: account-scoped writes, public reads (the whole point of
-- a landing page is that anonymous visitors load these images at
-- /site/[slug]).
--
-- Path convention:
--   landing-media/account-<account_id>/<timestamp>-<basename>.<ext>
--
-- 8 MB cap — generous for a hero/gallery photo, well under what a
-- phone camera photo needs to be resized to for web use anyway.
--
-- Idempotent — safe to re-run.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'landing-media',
  'landing-media',
  TRUE,
  8388608, -- 8 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Landing media is publicly readable" ON storage.objects;
CREATE POLICY "Landing media is publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'landing-media');

DROP POLICY IF EXISTS "Members can upload landing media" ON storage.objects;
CREATE POLICY "Members can upload landing media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'landing-media'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "Members can update landing media" ON storage.objects;
CREATE POLICY "Members can update landing media"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'landing-media'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "Members can delete landing media" ON storage.objects;
CREATE POLICY "Members can delete landing media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'landing-media'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );
