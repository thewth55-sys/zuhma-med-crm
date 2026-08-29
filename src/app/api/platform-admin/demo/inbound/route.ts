// ============================================================
// POST /api/platform-admin/demo/inbound
//
// Simulador de cliente para demos de ventas. Inyecta un mensaje ENTRANTE
// (como si un paciente escribiera por WhatsApp) en una cuenta DEMO,
// replicando lo que hace el webhook — busca/crea el contacto y la
// conversación, inserta el mensaje (sender_type='customer') y sube el
// unread_count. Dispara Realtime → aparece en vivo en la bandeja del CRM.
//
// Solo platform admins y solo cuentas is_demo=true (nunca una cuenta
// real, que sí depende de Meta).
// ============================================================

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/supabase/admin-client";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const adminCtx = await requirePlatformAdmin();

    const limit = checkRateLimit(`platformAdmin:demoInbound:${adminCtx.userId}`, RATE_LIMITS.send);
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as
      | { accountId?: unknown; phone?: unknown; name?: unknown; text?: unknown }
      | null;
    const accountId = typeof body?.accountId === "string" ? body.accountId : "";
    const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const text = typeof body?.text === "string" ? body.text.trim() : "";

    if (!accountId || !phone || !text) {
      return NextResponse.json({ error: "accountId, phone y text son obligatorios" }, { status: 400 });
    }

    const db = supabaseAdmin();

    const { data: account } = await db
      .from("accounts")
      .select("id, owner_user_id, is_demo")
      .eq("id", accountId)
      .maybeSingle();
    if (!account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }
    if (!account.is_demo) {
      return NextResponse.json({ error: "Solo cuentas demo" }, { status: 403 });
    }
    const ownerUserId = account.owner_user_id as string;

    // Buscar/crear contacto por (cuenta, teléfono).
    let contactId: string;
    const { data: existingContact } = await db
      .from("contacts")
      .select("id")
      .eq("account_id", accountId)
      .eq("phone", phone)
      .maybeSingle();
    if (existingContact) {
      contactId = existingContact.id;
    } else {
      const { data: newContact, error: contactErr } = await db
        .from("contacts")
        .insert({ account_id: accountId, user_id: ownerUserId, name: name || phone, phone })
        .select("id")
        .single();
      if (contactErr || !newContact) {
        console.error("[demo/inbound] contact create error:", contactErr);
        return NextResponse.json({ error: "No se pudo crear el contacto" }, { status: 500 });
      }
      contactId = newContact.id;
    }

    // Buscar/crear conversación (la más reciente del contacto).
    let conversationId: string;
    let unread = 0;
    const { data: existingConv } = await db
      .from("conversations")
      .select("id, unread_count")
      .eq("account_id", accountId)
      .eq("contact_id", contactId)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingConv) {
      conversationId = existingConv.id;
      unread = existingConv.unread_count ?? 0;
    } else {
      const { data: newConv, error: convErr } = await db
        .from("conversations")
        .insert({ account_id: accountId, user_id: ownerUserId, contact_id: contactId, status: "open" })
        .select("id")
        .single();
      if (convErr || !newConv) {
        console.error("[demo/inbound] conversation create error:", convErr);
        return NextResponse.json({ error: "No se pudo crear la conversación" }, { status: 500 });
      }
      conversationId = newConv.id;
    }

    const nowIso = new Date().toISOString();

    const { error: msgErr } = await db.from("messages").insert({
      conversation_id: conversationId,
      sender_type: "customer",
      content_type: "text",
      content_text: text,
      message_id: `demo-in-${randomUUID()}`,
      status: "delivered",
      created_at: nowIso,
    });
    if (msgErr) {
      console.error("[demo/inbound] message insert error:", msgErr);
      return NextResponse.json({ error: "No se pudo insertar el mensaje" }, { status: 500 });
    }

    const { error: convUpdErr } = await db
      .from("conversations")
      .update({
        last_message_text: text,
        last_message_at: nowIso,
        unread_count: unread + 1,
        status: "open",
        updated_at: nowIso,
      })
      .eq("id", conversationId);
    if (convUpdErr) {
      console.error("[demo/inbound] conversation update error:", convUpdErr);
    }

    return NextResponse.json({ ok: true, conversationId, contactId });
  } catch (err) {
    return toErrorResponse(err);
  }
}
