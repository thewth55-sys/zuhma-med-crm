-- ============================================================
-- 091_marketing_content_comments_and_executive.sql — hilo de
-- comentarios entre clínica y staff sobre una pieza de marketing, y
-- la "ejecutiva asignada" que aparece como autora del lado staff.
--
-- Design notes
--   - `marketing_executive_id` en `accounts` referencia
--     `platform_admins` (roster real de staff) — es solo un punto de
--     contacto/autoría, NO un mecanismo de acceso/gating (no
--     contradice "every account has full, equal access").
--   - `marketing_content_comments.author_name` va denormalizado a
--     propósito: el staff no tiene fila en `profiles`.
--
-- RLS
--   SELECT: is_account_member(account_id, 'viewer').
--   INSERT: is_account_member(account_id, 'agent') AND el comentario
--   se inserta a nombre de uno mismo (author_type='clinic',
--   author_user_id = auth.uid()). El lado staff inserta vía
--   supabaseAdmin() desde la ruta de admin (bypassa RLS).
--
-- Idempotente — seguro correr varias veces.
-- ============================================================

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS marketing_executive_id uuid REFERENCES platform_admins(user_id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS marketing_content_comments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  piece_id         uuid NOT NULL REFERENCES marketing_content_pieces(id) ON DELETE CASCADE,
  author_type      text NOT NULL CHECK (author_type IN ('clinic', 'staff')),
  author_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name      text NOT NULL,
  body             text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_content_comments_piece
  ON marketing_content_comments(piece_id, created_at);

ALTER TABLE marketing_content_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_content_comments_select ON marketing_content_comments;
CREATE POLICY marketing_content_comments_select ON marketing_content_comments FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS marketing_content_comments_insert ON marketing_content_comments;
CREATE POLICY marketing_content_comments_insert ON marketing_content_comments FOR INSERT
  WITH CHECK (
    is_account_member(account_id, 'agent')
    AND author_type = 'clinic'
    AND author_user_id = auth.uid()
  );
