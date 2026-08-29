-- ============================================================
-- 082_platform_announcements.sql — avisos controlados por el platform
-- admin, mostrados como carrusel en el dashboard de cada cuenta.
--
-- Mejoras:
--   - `audience`: 'all' (todos), 'accounts' (clínicas específicas) o
--     'users' (usuarios específicos), con la tabla announcement_targets.
--   - `send_notification`: si es true, al publicar se inserta además una
--     fila en `notifications` para cada destinatario → campana in-app + push.
--
-- Escrituras solo por service-role (/api/platform-admin/announcements).
-- Lectura por cualquier usuario autenticado que sea destinatario.
--
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_announcements (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title             TEXT NOT NULL,
  body              TEXT NOT NULL,
  image_url         TEXT,
  link_url          TEXT,
  link_label        TEXT,
  audience          TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'accounts', 'users')),
  send_notification BOOLEAN NOT NULL DEFAULT false,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  starts_at         TIMESTAMPTZ,
  ends_at           TIMESTAMPTZ,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_announcements_live
  ON platform_announcements(is_active, sort_order);

-- Destinatarios (cuando audience != 'all'). account_id → toda una clínica;
-- user_id → un usuario puntual.
CREATE TABLE IF NOT EXISTS announcement_targets (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  announcement_id UUID NOT NULL REFERENCES platform_announcements(id) ON DELETE CASCADE,
  account_id      UUID REFERENCES accounts(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcement_targets_ann ON announcement_targets(announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcement_targets_user ON announcement_targets(user_id);
CREATE INDEX IF NOT EXISTS idx_announcement_targets_account ON announcement_targets(account_id);

-- ¿El aviso `ann_id` es visible para el usuario actual? SECURITY DEFINER
-- para poder mirar announcement_targets sin exponerlo por RLS.
CREATE OR REPLACE FUNCTION public.announcement_visible_to_me(ann_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM announcement_targets t
    WHERE t.announcement_id = ann_id
      AND (
        t.user_id = auth.uid()
        OR t.account_id = (SELECT account_id FROM profiles WHERE user_id = auth.uid() LIMIT 1)
      )
  );
$$;

ALTER TABLE platform_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_targets   ENABLE ROW LEVEL SECURITY; -- solo service-role / la función definer

DROP POLICY IF EXISTS platform_announcements_select ON platform_announcements;
CREATE POLICY platform_announcements_select ON platform_announcements FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND is_active
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now())
    AND (audience = 'all' OR public.announcement_visible_to_me(id))
  );

DROP TRIGGER IF EXISTS set_updated_at ON platform_announcements;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON platform_announcements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Permite el tipo 'announcement' en notifications (para publicar + notificar).
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('conversation_assigned', 'appointment_reminder', 'announcement'));
