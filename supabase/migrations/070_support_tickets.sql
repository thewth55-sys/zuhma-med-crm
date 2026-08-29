-- ============================================================
-- 070_support_tickets.sql
--
-- Centro de ayuda del CRM sincronizado con Odoo Helpdesk.
--
-- El usuario crea tickets desde el CRM; el backend los crea en Odoo
-- (modelo helpdesk.ticket) vía JSON-RPC y guarda aquí una copia local:
-- el estado (etapa de Odoo) y el hilo de mensajes, que se sincronizan
-- por polling cada vez que el usuario abre el ticket. Las respuestas del
-- agente en Odoo aparecen como mensajes con dirección 'support'.
--
-- Lecturas: miembros de la cuenta (RLS). Escrituras (crear/sincronizar):
-- service-role desde los endpoints, que fijan account_id correctamente.
-- ============================================================

CREATE TABLE IF NOT EXISTS support_tickets (
  id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id         uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  odoo_ticket_id     integer NOT NULL,
  subject            text NOT NULL,
  status             text,                 -- etiqueta de etapa de Odoo (cacheada)
  last_synced_at     timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_tickets_account_idx ON support_tickets(account_id);
CREATE UNIQUE INDEX IF NOT EXISTS support_tickets_odoo_id_idx ON support_tickets(odoo_ticket_id);

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id       uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  odoo_message_id integer,                 -- null para el mensaje inicial sembrado localmente
  author_name     text,
  body            text,
  direction       text NOT NULL CHECK (direction IN ('user', 'support')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_ticket_messages_ticket_idx ON support_ticket_messages(ticket_id);
CREATE UNIQUE INDEX IF NOT EXISTS support_ticket_messages_odoo_id_idx
  ON support_ticket_messages(odoo_message_id) WHERE odoo_message_id IS NOT NULL;

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_tickets_select ON support_tickets;
CREATE POLICY support_tickets_select ON support_tickets FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS support_ticket_messages_select ON support_ticket_messages;
CREATE POLICY support_ticket_messages_select ON support_ticket_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM support_tickets t
      WHERE t.id = support_ticket_messages.ticket_id
        AND is_account_member(t.account_id)
    )
  );
