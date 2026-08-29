// ============================================================
// GET /api/platform-admin/demo/thread?accountId=&phone=
//
// Devuelve los mensajes de la conversación de un contacto en una cuenta
// DEMO, para que el simulador de cliente muestre el hilo (y las
// respuestas del agente) por polling — el platform admin no es miembro
// de la cuenta demo, así que no puede usar Realtime del cliente sobre
// ella; se lee con service-role, restringido a demos.
// ============================================================

import { NextResponse } from "next/server";

import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/supabase/admin-client";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin();

    const url = new URL(request.url);
    const accountId = url.searchParams.get("accountId") ?? "";
    const phone = (url.searchParams.get("phone") ?? "").trim();
    if (!accountId || !phone) {
      return NextResponse.json({ error: "accountId y phone son obligatorios" }, { status: 400 });
    }

    const db = supabaseAdmin();

    const { data: account } = await db
      .from("accounts")
      .select("is_demo")
      .eq("id", accountId)
      .maybeSingle();
    if (!account?.is_demo) {
      return NextResponse.json({ error: "Solo cuentas demo" }, { status: 403 });
    }

    const { data: contact } = await db
      .from("contacts")
      .select("id")
      .eq("account_id", accountId)
      .eq("phone", phone)
      .maybeSingle();
    if (!contact) {
      return NextResponse.json({ conversationId: null, messages: [] });
    }

    const { data: conversation } = await db
      .from("conversations")
      .select("id")
      .eq("account_id", accountId)
      .eq("contact_id", contact.id)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!conversation) {
      return NextResponse.json({ conversationId: null, messages: [] });
    }

    const { data: messages } = await db
      .from("messages")
      .select("id, sender_type, content_text, content_type, created_at")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true })
      .limit(200);

    return NextResponse.json({
      conversationId: conversation.id,
      messages: (messages ?? []).map((m) => ({
        id: m.id,
        senderType: m.sender_type,
        text: m.content_text,
        contentType: m.content_type,
        createdAt: m.created_at,
      })),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
