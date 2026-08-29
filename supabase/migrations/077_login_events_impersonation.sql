-- ============================================================
-- 077_login_events_impersonation.sql — distingue un login real del
-- cliente de la sesión creada cuando un admin de plataforma "Impersona"
-- una cuenta (que dispara el mismo flujo client-side SIGNED_IN →
-- log-session en el navegador del admin, porque la impersonación cambia
-- la sesión del navegador al usuario del cliente).
--
-- Sin esto, un admin husmeando una cuenta hace que aparezca como
-- actividad reciente del CLIENTE. Con estas columnas, "Sesiones
-- recientes" puede marcar la fila como impersonación y atribuirla al
-- ADMIN que la hizo (impersonator_user_id), en vez de al cliente.
--
-- Es solo etiqueta de analítica; el rastro de auditoría de seguridad
-- real vive en platform_admin_audit_log (server-side).
--
-- Idempotente.
-- ============================================================

ALTER TABLE login_events
  ADD COLUMN IF NOT EXISTS is_impersonation      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS impersonator_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Índice para "última actividad" real del cliente (excluye impersonación).
CREATE INDEX IF NOT EXISTS idx_login_events_account_real
  ON login_events(account_id, created_at DESC) WHERE is_impersonation = false;
