import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin-client";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { odooConfigured } from "@/lib/odoo/client";
import { createOdooTicket, postOdooTicketMessage } from "@/lib/odoo/helpdesk";

/**
 * GET  /api/support/tickets — lista los tickets de la cuenta del usuario.
 * POST /api/support/tickets — crea un ticket en Odoo Helpdesk.
 *
 * Los tickets se crean en Odoo (modelo helpdesk.ticket) y se guarda una
 * copia local; el hilo se sincroniza por polling al abrir el ticket.
 */

async function resolveUserAccount() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("account_id, full_name, email")
    .eq("user_id", user.id)
    .maybeSingle();
  return { supabase, user, profile };
}

export async function GET() {
  const { supabase, user } = await resolveUserAccount();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // RLS limita a la cuenta del usuario.
  const { data, error } = await supabase
    .from("support_tickets")
    .select("id, subject, status, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "No se pudieron cargar los tickets" }, { status: 500 });
  }
  return NextResponse.json({ tickets: data ?? [] });
}

export async function POST(request: Request) {
  const { user, profile } = await resolveUserAccount();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!profile?.account_id) {
    return NextResponse.json({ error: "Tu perfil no está ligado a una cuenta." }, { status: 403 });
  }

  const limit = checkRateLimit(`support:create:${user.id}`, RATE_LIMITS.adminAction);
  if (!limit.success) return rateLimitResponse(limit);

  const body = await request.json().catch(() => null);
  const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!subject || !message) {
    return NextResponse.json({ error: "El asunto y el mensaje son requeridos." }, { status: 400 });
  }

  if (!odooConfigured()) {
    return NextResponse.json(
      { error: "El soporte no está disponible en este momento. Intenta más tarde." },
      { status: 503 },
    );
  }

  let odooTicketId: number;
  try {
    odooTicketId = await createOdooTicket({
      subject,
      body: message,
      partnerName: profile.full_name,
      partnerEmail: profile.email ?? user.email ?? null,
    });
    // Publica el mensaje inicial en el chatter para que aparezca en el
    // hilo al sincronizar (además de quedar en la descripción del ticket).
    await postOdooTicketMessage(odooTicketId, message);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al crear el ticket en Odoo";
    console.error("[support/tickets] Odoo create failed:", msg);
    return NextResponse.json({ error: "No se pudo crear el ticket. Intenta de nuevo." }, { status: 502 });
  }

  const admin = supabaseAdmin();
  const { data: ticket, error: insertErr } = await admin
    .from("support_tickets")
    .insert({
      account_id: profile.account_id,
      created_by_user_id: user.id,
      odoo_ticket_id: odooTicketId,
      subject,
      last_synced_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertErr || !ticket) {
    return NextResponse.json({ error: "Ticket creado en Odoo, pero no se pudo guardar localmente." }, { status: 500 });
  }

  return NextResponse.json({ id: ticket.id });
}
