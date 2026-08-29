-- ============================================================
-- 083_conversation_response_reminders.sql — recordatorios ESCALADOS para
-- conversaciones entrantes sin responder.
--
-- Idea: cuando un cliente escribe y nadie del equipo responde, se dispara
-- un recordatorio a los 5 min, luego 10, 20, 40 y de ahí cada 60 min
-- (hora), hasta que un usuario responda o se cierre la conversación.
--
-- Mecánica:
--   - `conversation_reminders` guarda el "reloj" de cada conversación
--     pendiente: desde cuándo espera el cliente (pending_since), cuántos
--     recordatorios se han mandado (reminder_count) y cuándo fue el último
--     (last_reminder_at). Una fila = una conversación esperando respuesta.
--   - Triggers sobre `messages` mantienen ese reloj:
--       · mensaje del CLIENTE ('customer')  → abre el reloj si no existe
--         (mantiene el pending_since original en mensajes de seguimiento).
--       · mensaje de un AGENTE humano ('agent') → borra el reloj (respondido).
--       · mensaje de 'bot' (IA/automatización) → no cuenta como respuesta
--         de un usuario, así que NO detiene el escalado.
--   - Un trigger sobre `conversations` borra el reloj al cerrar la conversación.
--   - El cron (/api/conversation-reminders/cron, pg_cron cada minuto) lee las
--     filas vencidas, aplica la curva de escalado + la regla de horario
--     nocturno, e inserta una fila en `notifications` por destinatario
--     (campana in-app + push FCM vía el webhook notifications→push existente).
--
-- Se amplía el CHECK de `notifications.type` para permitir 'response_reminder'.
--
-- NO se hace backfill de conversaciones ya pendientes: el escalado aplica a
-- partir de aquí para no provocar una avalancha de notificaciones al desplegar.
--
-- Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- Estado del reloj de recordatorios (una fila por conversación pendiente).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversation_reminders (
  conversation_id  uuid PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  account_id       uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  pending_since    timestamptz NOT NULL,
  reminder_count   integer NOT NULL DEFAULT 0,
  last_reminder_at timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- El cron filtra por el "último evento" (last_reminder_at, o pending_since si
-- aún no se ha mandado ninguno): índices para que ese barrido sea barato.
CREATE INDEX IF NOT EXISTS idx_conversation_reminders_pending
  ON conversation_reminders(pending_since) WHERE last_reminder_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_conversation_reminders_last
  ON conversation_reminders(last_reminder_at);
CREATE INDEX IF NOT EXISTS idx_conversation_reminders_account
  ON conversation_reminders(account_id);

ALTER TABLE conversation_reminders ENABLE ROW LEVEL SECURITY;

-- Los miembros de la cuenta pueden LEER el estado (útil para depurar / UI
-- futura). Las escrituras son exclusivas de los triggers SECURITY DEFINER y
-- del cron (service-role, que ignora RLS).
DROP POLICY IF EXISTS conversation_reminders_select ON conversation_reminders;
CREATE POLICY conversation_reminders_select ON conversation_reminders FOR SELECT
  USING (is_account_member(account_id));

-- ------------------------------------------------------------
-- Trigger sobre messages: abre / cierra el reloj.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION maintain_conversation_reminder()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id uuid;
  v_status     text;
BEGIN
  -- Solo nos interesan mensajes de cliente (abrir) o de agente (cerrar);
  -- los de 'bot' no tocan el reloj.
  IF NEW.sender_type NOT IN ('customer', 'agent') THEN
    RETURN NEW;
  END IF;

  SELECT account_id, status INTO v_account_id, v_status
  FROM conversations WHERE id = NEW.conversation_id;

  IF v_account_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.sender_type = 'customer' THEN
    -- El cliente escribió: arranca el reloj si no existe y la conversación
    -- no está cerrada. ON CONFLICT DO NOTHING conserva el pending_since
    -- original (el cliente espera desde su PRIMER mensaje sin responder).
    IF v_status = 'closed' THEN
      RETURN NEW;
    END IF;
    INSERT INTO conversation_reminders (
      conversation_id, account_id, pending_since, reminder_count, last_reminder_at
    ) VALUES (
      NEW.conversation_id, v_account_id, COALESCE(NEW.created_at, now()), 0, NULL
    )
    ON CONFLICT (conversation_id) DO NOTHING;
  ELSE
    -- Un agente humano respondió: se detiene el escalado.
    DELETE FROM conversation_reminders WHERE conversation_id = NEW.conversation_id;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Nunca dejar que un fallo aquí bloquee la inserción del mensaje.
  RAISE WARNING 'maintain_conversation_reminder failed for message %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION maintain_conversation_reminder() OWNER TO postgres;

DROP TRIGGER IF EXISTS on_message_maintain_reminder ON messages;
CREATE TRIGGER on_message_maintain_reminder
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION maintain_conversation_reminder();

-- ------------------------------------------------------------
-- Trigger sobre conversations: al cerrar, limpia el reloj.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION clear_reminder_on_conversation_close()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed' THEN
    DELETE FROM conversation_reminders WHERE conversation_id = NEW.id;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'clear_reminder_on_conversation_close failed for conversation %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION clear_reminder_on_conversation_close() OWNER TO postgres;

DROP TRIGGER IF EXISTS on_conversation_close_clear_reminder ON conversations;
CREATE TRIGGER on_conversation_close_clear_reminder
  AFTER UPDATE OF status ON conversations
  FOR EACH ROW EXECUTE FUNCTION clear_reminder_on_conversation_close();

-- ------------------------------------------------------------
-- Permitir el tipo 'response_reminder' en notifications.
-- ------------------------------------------------------------
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'conversation_assigned',
    'appointment_reminder',
    'announcement',
    'response_reminder'
  ));
