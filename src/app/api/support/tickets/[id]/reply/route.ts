import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin-client";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { odooConfigured } from "@/lib/odoo/client";
import { postOdooTicketMessage } from "@/lib/odoo/helpdesk";

/**
 * POST /api/support/tickets/[id]/reply
 *
 * Publica una respuesta del usuario en el chatter del ticket de Odoo y la
 * guarda localmente como 'user'. Al llevar su odoo_message_id, la próxima
 * sincronización no la duplica.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = checkRateLimit(`support:reply:${user.id}`, RATE_LIMITS.adminAction);
  if (!limit.success) return rateLimitResponse(limit);

  const body = await request.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) return NextResponse.json({ error: "El mensaje es requerido." }, { status: 400 });

  // RLS: sólo obtiene el ticket si el usuario pertenece a la cuenta.
  const { data: ticket } = await supabase
    .from("support_tickets")
    .select("id, odoo_ticket_id")
    .eq("id", id)
    .maybeSingle();
  if (!ticket) return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });

  if (!odooConfigured()) {
    return NextResponse.json({ error: "El soporte no está disponible en este momento." }, { status: 503 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("user_id", user.id)
    .maybeSingle();

  let messageId: number;
  try {
    messageId = await postOdooTicketMessage(ticket.odoo_ticket_id, message);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al enviar el mensaje a Odoo";
    console.error("[support/tickets/:id/reply] Odoo post failed:", msg);
    return NextResponse.json({ error: "No se pudo enviar la respuesta." }, { status: 502 });
  }

  const admin = supabaseAdmin();
  await admin.from("support_ticket_messages").insert({
    ticket_id: ticket.id,
    odoo_message_id: messageId,
    author_name: profile?.full_name ?? profile?.email ?? user.email ?? "Tú",
    body: message,
    direction: "user",
  });
  await admin
    .from("support_tickets")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", ticket.id);

  return NextResponse.json({ ok: true });
}
