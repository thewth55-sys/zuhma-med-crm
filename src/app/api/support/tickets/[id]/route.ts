import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin-client";
import { odooConfigured } from "@/lib/odoo/client";
import {
  getOdooTicketMessages,
  getOdooTicketStage,
  getIntegrationPartnerId,
} from "@/lib/odoo/helpdesk";

/**
 * GET /api/support/tickets/[id]
 *
 * Devuelve el ticket y su hilo. Antes de responder sincroniza desde Odoo
 * (polling): trae la etapa y los mensajes del chatter e inserta los que
 * falten. La dirección se decide por autor: los mensajes del usuario
 * integrador (los que publica el CRM) son 'user'; el resto, respuestas
 * del agente ('support').
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // RLS: sólo devuelve el ticket si el usuario es miembro de la cuenta.
  const { data: ticket } = await supabase
    .from("support_tickets")
    .select("id, odoo_ticket_id, subject, status, last_synced_at")
    .eq("id", id)
    .maybeSingle();

  if (!ticket) return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });

  let syncError: string | null = null;
  if (odooConfigured()) {
    try {
      const admin = supabaseAdmin();
      const [stage, messages, selfPartnerId, existing] = await Promise.all([
        getOdooTicketStage(ticket.odoo_ticket_id),
        getOdooTicketMessages(ticket.odoo_ticket_id),
        getIntegrationPartnerId(),
        admin
          .from("support_ticket_messages")
          .select("odoo_message_id")
          .eq("ticket_id", ticket.id),
      ]);

      const known = new Set(
        (existing.data ?? [])
          .map((m) => m.odoo_message_id)
          .filter((v): v is number => typeof v === "number"),
      );

      const toInsert = messages
        .filter((m) => !known.has(m.id))
        .map((m) => ({
          ticket_id: ticket.id,
          odoo_message_id: m.id,
          author_name: m.authorName,
          body: m.body,
          direction:
            selfPartnerId != null && m.authorId === selfPartnerId ? "user" : "support",
          created_at: m.date ? new Date(m.date.replace(" ", "T") + "Z").toISOString() : new Date().toISOString(),
        }))
        .filter((m) => m.body.length > 0);

      if (toInsert.length > 0) {
        await admin.from("support_ticket_messages").insert(toInsert);
      }
      await admin
        .from("support_tickets")
        .update({ status: stage, last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", ticket.id);
      ticket.status = stage;
    } catch (err) {
      syncError = err instanceof Error ? err.message : "Error al sincronizar con Odoo";
      console.error("[support/tickets/:id] sync failed:", syncError);
    }
  }

  const { data: messages } = await supabase
    .from("support_ticket_messages")
    .select("id, author_name, body, direction, created_at")
    .eq("ticket_id", ticket.id)
    .order("created_at", { ascending: true });

  return NextResponse.json({
    ticket: { id: ticket.id, subject: ticket.subject, status: ticket.status },
    messages: messages ?? [],
    ...(syncError ? { syncWarning: true } : {}),
  });
}
