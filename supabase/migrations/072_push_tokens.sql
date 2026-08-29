-- ============================================================
-- 072_push_tokens.sql — tokens de dispositivo para la app Android
-- (Capacitor + Firebase Cloud Messaging).
--
-- Separado del flujo web-only de notificaciones (Notification API del
-- navegador, solo dispara con una pestaña abierta): los tokens FCM
-- permiten que el SERVIDOR mande una notificación aunque la app esté
-- cerrada / el teléfono bloqueado. Una fila por (user, token) — el
-- mismo dispositivo re-registrándose hace upsert en lugar de acumular
-- duplicados. Un usuario puede tener varias filas (varios dispositivos);
-- un token se desregistra borrando su fila (p.ej. al cerrar sesión).
--
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS push_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL,
  platform    TEXT NOT NULL DEFAULT 'android' CHECK (platform IN ('android', 'ios', 'web')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_push_tokens_user_token ON push_tokens(user_id, token);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_account ON push_tokens(account_id);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- Solo filas propias — un token de dispositivo no le sirve a nadie más
-- que a su dueño y al job server-side que envía el push (service-role,
-- que ignora RLS por completo).
DROP POLICY IF EXISTS push_tokens_select ON push_tokens;
CREATE POLICY push_tokens_select ON push_tokens FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS push_tokens_insert ON push_tokens;
CREATE POLICY push_tokens_insert ON push_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS push_tokens_update ON push_tokens;
CREATE POLICY push_tokens_update ON push_tokens FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS push_tokens_delete ON push_tokens;
CREATE POLICY push_tokens_delete ON push_tokens FOR DELETE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS set_updated_at ON push_tokens;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON push_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
