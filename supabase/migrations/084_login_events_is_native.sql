-- ============================================================
-- 084_login_events_is_native.sql — marca si un inicio de sesión ocurrió
-- desde la app nativa Android (Capacitor WebView) en vez de un navegador.
--
-- El user_agent del WebView de Capacitor es casi idéntico al de Chrome
-- móvil, así que no es fiable deducirlo del UA. En su lugar, el cliente
-- envía explícitamente `native: Capacitor.isNativePlatform()` al hacer
-- /api/auth/log-session (igual que ya manda los marcadores de
-- impersonación). Esto permite que "Sesiones recientes" en /admin muestre
-- de un vistazo si el usuario entra desde la app o desde el navegador —
-- útil para diagnosticar por qué no le llegan las notificaciones push.
--
-- Idempotente.
-- ============================================================

ALTER TABLE login_events
  ADD COLUMN IF NOT EXISTS is_native boolean NOT NULL DEFAULT false;
