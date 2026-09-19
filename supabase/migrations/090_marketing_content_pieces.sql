-- ============================================================
-- 090_marketing_content_pieces.sql — Aprobación de contenido de
-- Marketing, portado desde zentro-med (mismo feature, adaptado: sin
-- `marketing_addon`/gating por cuenta — este repo no tiene plan
-- tiers ni gating de features, "every account has full, equal
-- access to all features" per CLAUDE.md, así que la tabla se crea
-- directo con todas las columnas de una vez en vez de en 2 pasadas).
--
-- Design notes
--   - Piezas de contenido (reel/carrusel/historia) que el admin de
--     plataforma sube para una clínica vía Google Drive link; la
--     clínica las aprueba/rechaza/comenta desde su dashboard.
--   - `status` incluye 'published' desde el inicio — se marca a mano
--     desde el admin cuando la pieza ya salió al aire.
--   - `description`: bajada corta bajo el título. `compliance_checklist`:
--     bullets de cumplimiento que el admin redacta al subir la pieza
--     (informativo para la clínica, no algo que ella edita).
--   - Sin policy de INSERT ni DELETE para el cliente: esas filas las
--     crea únicamente el admin de plataforma vía service role.
--
-- RLS
--   SELECT: is_account_member(account_id, 'viewer').
--   UPDATE: is_account_member(account_id, 'agent').
--
-- Idempotente — seguro correr varias veces.
-- ============================================================

CREATE TABLE IF NOT EXISTS marketing_content_pieces (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id             uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title                  text NOT NULL,
  description            text,
  content_type           text NOT NULL CHECK (content_type IN ('reel', 'carrusel', 'historia')),
  drive_url              text NOT NULL,
  scheduled_publish_at   timestamptz,
  status                 text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'published')),
  feedback               text,
  compliance_checklist   text[],
  reviewed_by_user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at            timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_content_pieces_account
  ON marketing_content_pieces(account_id, created_at DESC);

ALTER TABLE marketing_content_pieces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_content_pieces_select ON marketing_content_pieces;
CREATE POLICY marketing_content_pieces_select ON marketing_content_pieces FOR SELECT
  USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS marketing_content_pieces_update ON marketing_content_pieces;
CREATE POLICY marketing_content_pieces_update ON marketing_content_pieces FOR UPDATE
  USING (is_account_member(account_id, 'agent'));

DROP TRIGGER IF EXISTS set_updated_at ON marketing_content_pieces;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON marketing_content_pieces
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
