import { odooExecuteKw } from "@/lib/odoo/client";

// Helpers de alto nivel para Odoo Helpdesk. El modelo y el equipo son
// configurables por si la instancia usa un módulo distinto.
const TICKET_MODEL = process.env.ODOO_HELPDESK_MODEL || "helpdesk.ticket";
const TEAM_ID = process.env.ODOO_HELPDESK_TEAM_ID
  ? Number(process.env.ODOO_HELPDESK_TEAM_ID)
  : null;

export interface CreateTicketArgs {
  subject: string;
  body: string;
  partnerName?: string | null;
  partnerEmail?: string | null;
}

/** Crea un ticket en Odoo Helpdesk y devuelve su id. */
export async function createOdooTicket(args: CreateTicketArgs): Promise<number> {
  const vals: Record<string, unknown> = {
    name: args.subject,
    description: args.body,
  };
  if (args.partnerName) vals.partner_name = args.partnerName;
  if (args.partnerEmail) vals.partner_email = args.partnerEmail;
  if (TEAM_ID) vals.team_id = TEAM_ID;

  const id = await odooExecuteKw<number>(TICKET_MODEL, "create", [vals]);
  return id;
}

/** Nombre de la etapa actual del ticket (p.ej. "Nuevo", "En progreso"). */
export async function getOdooTicketStage(ticketId: number): Promise<string | null> {
  const rows = await odooExecuteKw<Array<{ stage_id?: [number, string] | false }>>(
    TICKET_MODEL,
    "read",
    [[ticketId]],
    { fields: ["stage_id"] },
  );
  const stage = rows?.[0]?.stage_id;
  return Array.isArray(stage) ? stage[1] : null;
}

export interface OdooMessage {
  id: number;
  body: string;
  authorId: number | null;
  authorName: string | null;
  date: string | null;
}

/**
 * partner_id del usuario integrador (el de la API key). Los mensajes que
 * el CRM publica (ticket inicial y respuestas) quedan a su nombre; así,
 * al sincronizar, todo mensaje con OTRO autor es una respuesta del agente
 * ('support') y los suyos son del usuario ('user').
 */
export async function getIntegrationPartnerId(): Promise<number | null> {
  const rows = await odooExecuteKw<Array<{ partner_id?: [number, string] | false }>>(
    "res.users",
    "search_read",
    [[["login", "=", process.env.ODOO_USERNAME]]],
    { fields: ["partner_id"], limit: 1 },
  );
  const p = rows?.[0]?.partner_id;
  return Array.isArray(p) ? p[0] : null;
}

/**
 * Mensajes del chatter del ticket (comentarios y correos), en orden
 * cronológico. Excluye notificaciones automáticas del sistema.
 */
export async function getOdooTicketMessages(ticketId: number): Promise<OdooMessage[]> {
  const rows = await odooExecuteKw<
    Array<{ id: number; body?: string; author_id?: [number, string] | false; date?: string | false }>
  >(
    "mail.message",
    "search_read",
    [
      [
        ["model", "=", TICKET_MODEL],
        ["res_id", "=", ticketId],
        ["message_type", "in", ["comment", "email"]],
      ],
    ],
    { fields: ["id", "body", "author_id", "date"], order: "date asc" },
  );

  return (rows ?? []).map((r) => ({
    id: r.id,
    body: stripHtml(r.body || ""),
    authorId: Array.isArray(r.author_id) ? r.author_id[0] : null,
    authorName: Array.isArray(r.author_id) ? r.author_id[1] : null,
    date: typeof r.date === "string" ? r.date : null,
  }));
}

/** Publica un mensaje en el chatter del ticket. Devuelve el id del mensaje. */
export async function postOdooTicketMessage(ticketId: number, body: string): Promise<number> {
  const messageId = await odooExecuteKw<number>(TICKET_MODEL, "message_post", [ticketId], {
    body,
    message_type: "comment",
    subtype_xmlid: "mail.mt_comment",
  });
  return messageId;
}

// Odoo devuelve el body como HTML; para el hilo del CRM basta texto plano.
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
