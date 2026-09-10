-- ============================================================
-- 088_qr_inbound_media.sql
--
-- Storage bucket for media RECEIVED over the unofficial QR/Baileys
-- connection (Fase 1 was text-only; this is the immediate follow-up).
--
-- Why a new bucket instead of reusing `chat-media` (023):
--   `chat-media` is PUBLIC (Meta needs to fetch outbound attachments by
--   URL with no auth) and is written to by end-user browsers under
--   RLS. Inbound QR media is the opposite shape: written by the
--   wa-qr-gateway service (its own Supabase service-role key, which
--   bypasses RLS entirely) and read only through an authenticated
--   monolith proxy route (src/app/api/whatsapp/qr-media/.../route.ts,
--   mirroring src/app/api/whatsapp/media/[mediaId]/route.ts's auth
--   gate for the Meta equivalent). A patient's photo shouldn't be
--   sitting behind a public, guessable URL just because the send
--   direction happens to need one.
--
-- No storage.objects RLS policies are added here on purpose: with no
-- permissive policy for this bucket, Postgres RLS defaults to deny for
-- every role except the ones that bypass RLS altogether (service_role,
-- which is exactly who writes here and who the proxy route reads
-- through). If a future feature needs a browser to read this bucket
-- directly, add a scoped SELECT policy then — don't open it up
-- pre-emptively for a need that doesn't exist yet.
--
-- Path convention: qr-inbound-media/account-<account_id>/<message_id>.<ext>
-- (same account-<uuid> first segment as chat-media/flow-media, kept
-- for consistency even though nothing currently reads it via RLS).
--
-- Idempotent — safe to re-run.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'qr-inbound-media',
  'qr-inbound-media',
  FALSE,
  16777216, -- 16 MB, same ceiling as chat-media (023)
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp',
    'video/mp4', 'video/3gpp',
    'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr',
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'application/octet-stream' -- fallback for a mimetype WhatsApp didn't report cleanly
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
