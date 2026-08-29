-- ============================================================
-- 076_login_2fa_and_trusted_devices.sql
--
-- 2FA por código al correo (solo en dispositivos nuevos) + "recordar
-- dispositivo" 60 días.
--
--   login_2fa_challenges — reto efímero entre paso 1 (validar
--     usuario/contraseña + enviar código) y paso 2 (verificar código y
--     recién ahí crear la sesión). Guarda el hash del código y la sesión
--     de Supabase CIFRADA (access/refresh), para no exponer credenciales
--     ni dejar al usuario logueado antes de pasar el 2Fo. Solo lo toca el
--     service-role del servidor → RLS activa SIN políticas (nadie más lee).
--
--   trusted_devices — dispositivos donde el usuario marcó "recordar";
--     mientras exista una cookie de dispositivo válida (token hasheado
--     aquí) NO se pide código. El usuario puede listarlos/revocarlos.
--
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS login_2fa_challenges (
  id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email              text NOT NULL,
  code_hash          text NOT NULL,
  encrypted_session  text NOT NULL,          -- {access_token, refresh_token} cifrado (AES-GCM)
  attempts           smallint NOT NULL DEFAULT 0,
  expires_at         timestamptz NOT NULL,
  consumed_at        timestamptz,
  ip_address         text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_2fa_user ON login_2fa_challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_login_2fa_expires ON login_2fa_challenges(expires_at);

-- Solo el service-role (que ignora RLS) toca esta tabla. RLS activa sin
-- políticas = nadie más puede leer/escribir por ningún camino.
ALTER TABLE login_2fa_challenges ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS trusted_devices (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,
  label         text,                         -- p.ej. "Chrome · macOS" o "App Android"
  ip_address    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trusted_devices_user ON trusted_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_token ON trusted_devices(token_hash);

-- El usuario ve y revoca sus propios dispositivos (para el panel de
-- Seguridad). El alta/uso lo hace el service-role del servidor.
ALTER TABLE trusted_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trusted_devices_select ON trusted_devices;
CREATE POLICY trusted_devices_select ON trusted_devices FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS trusted_devices_delete ON trusted_devices;
CREATE POLICY trusted_devices_delete ON trusted_devices FOR DELETE
  USING (auth.uid() = user_id);
