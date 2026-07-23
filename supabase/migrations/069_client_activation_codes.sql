-- ============================================================
-- 069_client_activation_codes.sql
--
-- Alta de clientes por CÓDIGO en vez de link de invitación.
--
-- El link de invitación de GoTrue se rompe con escáneres de correo /
-- prefetch (el token de un solo uso se consume → otp_expired). En su
-- lugar, el dueño recibe un CÓDIGO que teclea en /activar; un código
-- no se auto-consume al ser escaneado. Aquí viven:
--
--   - En `accounts` (1 código por dueño de cuenta): el hash SHA-256 del
--     código, su expiración y cuándo se usó (para quemarlo).
--   - En `profiles` (por usuario): el registro de aceptación de los
--     Términos y Condiciones (fecha + versión aceptada).
--
-- Todo el acceso a estas columnas es server-side vía service-role
-- (creación de cuenta y POST /api/activate), así que no requieren
-- políticas RLS nuevas. Idempotente.
-- ============================================================

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS activation_code_hash       text,
  ADD COLUMN IF NOT EXISTS activation_code_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS activation_code_used_at    timestamptz;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version     text;
