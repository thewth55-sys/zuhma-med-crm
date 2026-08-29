-- ============================================================
-- 080_booking_page_config.sql — personalización estilo "link-in-bio"
-- de la página pública de reserva (/agendar/[slug]).
--
-- Un solo jsonb en accounts guarda todo el look/contenido: color de
-- acento, portada, logo, headline/tagline/bio, botones de contacto y
-- redes, y qué bloques mostrar. Flexible sin necesitar migraciones
-- futuras por cada campo nuevo. Nulo/ausente = valores por defecto
-- (headline = nombre de la cuenta, acento coral).
--
-- Idempotente.
-- ============================================================

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS booking_page jsonb;
