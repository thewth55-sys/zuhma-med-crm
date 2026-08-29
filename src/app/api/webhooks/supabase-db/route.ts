import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase/admin-client";
import { sendPushToAccount, sendPushToUser } from "@/lib/push/send";

/**
 * Receptor de dos Database Webhooks de Supabase (configurados en el
 * dashboard de Supabase, no en código):
 *
 *   1. INSERT en `messages` (sender_type = 'customer') → push a toda la
 *      cuenta (inbox compartido).
 *   2. INSERT en `notifications` → push solo al `user_id` de esa fila
 *      (hoy el único tipo es conversation_assigned, migración 027).
 *
 * Es el complemento "app cerrada" del flujo de notificación en pestaña;
 * un push FCM nativo es la única forma de llegar a un teléfono con la app
 * cerrada. Ambos webhooks POSTean aquí con el mismo secreto compartido
 * para que este endpoint no sea un disparador público de pushes.
 */
export async function POST(request: Request) {
  const secret = process.env.SUPABASE_DB_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-webhook-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || body.type !== "INSERT" || !body.record) {
    return NextResponse.json({ ok: true });
  }

  try {
    if (body.table === "messages" && body.record.sender_type === "customer") {
      await handleNewMessage(body.record);
    } else if (body.table === "notifications") {
      await handleNewNotification(body.record);
    }
  } catch (err) {
    // Nunca devolver 500 — Supabase reintenta un webhook fallido, y un
    // push roto no vale una tormenta de reintentos.
    console.error("[supabase-db webhook] handler error:", err);
  }

  return NextResponse.json({ ok: true });
}

async function handleNewMessage(message: { conversation_id: string; content_text: string | null }) {
  const db = supabaseAdmin();
  const { data: conversation } = await db
    .from("conversations")
    .select("account_id, contact_id")
    .eq("id", message.conversation_id)
    .maybeSingle();
  if (!conversation) return;

  const { data: contact } = await db
    .from("contacts")
    .select("name, phone")
    .eq("id", conversation.contact_id)
    .maybeSingle();

  await sendPushToAccount(conversation.account_id, {
    title: contact?.name || contact?.phone || "Nuevo mensaje",
    body: message.content_text || "Mensaje nuevo",
    url: `/inbox?c=${message.conversation_id}`,
  });
}

async function handleNewNotification(notification: {
  user_id: string;
  title: string;
  body: string | null;
  conversation_id: string | null;
}) {
  await sendPushToUser(notification.user_id, {
    title: notification.title,
    body: notification.body || "",
    url: notification.conversation_id ? `/inbox?c=${notification.conversation_id}` : undefined,
  });
}
