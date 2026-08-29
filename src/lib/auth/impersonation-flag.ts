/**
 * Marcadores efímeros (sessionStorage) que estampa el menú de acciones de
 * admin justo antes de impersonar una cuenta, y que use-auth lee en el
 * SIGNED_IN resultante para reenviarlos a /api/auth/log-session. Sirven
 * para etiquetar el login como impersonación y atribuirlo al admin —
 * solo analítica, sin implicación de privilegios (el rastro de seguridad
 * real está en platform_admin_audit_log, server-side).
 */
export const IMPERSONATION_SESSION_FLAG = "zuhma_impersonation";
export const IMPERSONATOR_ID_KEY = "zuhma_impersonator_id";
