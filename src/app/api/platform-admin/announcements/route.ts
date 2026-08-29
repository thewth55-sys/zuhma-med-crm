// ============================================================
// /api/platform-admin/announcements
//
//   GET  — lista todos los avisos (admin, service-role).
//   POST — crea un aviso con segmentación (todos / cuentas / usuarios) y,
//          opcionalmente, dispara una notificación (campana + push) a los
//          destinatarios.
// ============================================================

import { NextResponse } from "next/server";

import { requirePlatformAdmin, logPlatformAdminAction } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/supabase/admin-client";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

export async function GET() {
  try {
    await requirePlatformAdmin();
    const db = supabaseAdmin();
    const { data } = await db
      .from("platform_announcements")
      .select("id, title, body, image_url, link_url, link_label, audience, send_notification, is_active, starts_at, ends_at, created_at")
      .order("created_at", { ascending: false });
    return NextResponse.json({ announcements: data ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requirePlatformAdmin();

    const limit = checkRateLimit(`platformAdmin:announce:${admin.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as
      | {
          title?: unknown;
          body?: unknown;
          image_url?: unknown;
          link_url?: unknown;
          link_label?: unknown;
          audience?: unknown;
          account_ids?: unknown;
          user_ids?: unknown;
          send_notification?: unknown;
          starts_at?: unknown;
          ends_at?: unknown;
        }
      | null;

    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const text = typeof body?.body === "string" ? body.body.trim() : "";
    const audience = body?.audience === "accounts" || body?.audience === "users" ? body.audience : "all";
    const sendNotification = body?.send_notification === true;
    const accountIds = Array.isArray(body?.account_ids) ? (body.account_ids as string[]) : [];
    const userIds = Array.isArray(body?.user_ids) ? (body.user_ids as string[]) : [];

    if (!title || !text) {
      return NextResponse.json({ error: "Título y cuerpo son obligatorios" }, { status: 400 });
    }
    if (audience === "accounts" && accountIds.length === 0) {
      return NextResponse.json({ error: "Elige al menos una cuenta" }, { status: 400 });
    }
    if (audience === "users" && userIds.length === 0) {
      return NextResponse.json({ error: "Elige al menos un usuario" }, { status: 400 });
    }

    const db = supabaseAdmin();

    const { data: announcement, error: annErr } = await db
      .from("platform_announcements")
      .insert({
        title,
        body: text,
        image_url: typeof body?.image_url === "string" ? body.image_url : null,
        link_url: typeof body?.link_url === "string" ? body.link_url : null,
        link_label: typeof body?.link_label === "string" ? body.link_label : null,
        audience,
        send_notification: sendNotification,
        starts_at: typeof body?.starts_at === "string" ? body.starts_at : null,
        ends_at: typeof body?.ends_at === "string" ? body.ends_at : null,
        created_by: admin.userId,
      })
      .select("id")
      .single();

    if (annErr || !announcement) {
      console.error("[POST /announcements] insert error:", annErr);
      return NextResponse.json({ error: "No se pudo crear el aviso" }, { status: 500 });
    }

    // Destinatarios (targets) cuando no es 'all'.
    if (audience === "accounts") {
      await db.from("announcement_targets").insert(
        accountIds.map((id) => ({ announcement_id: announcement.id, account_id: id })),
      );
    } else if (audience === "users") {
      await db.from("announcement_targets").insert(
        userIds.map((id) => ({ announcement_id: announcement.id, user_id: id })),
      );
    }

    // Publicar + notificación: resuelve los usuarios destinatarios e inserta
    // filas en notifications (dispara campana in-app + push por el pipeline).
    if (sendNotification) {
      let query = db.from("profiles").select("user_id, account_id");
      if (audience === "accounts") query = query.in("account_id", accountIds);
      else if (audience === "users") query = query.in("user_id", userIds);
      const { data: recipients } = await query;

      const rows = (recipients ?? [])
        .filter((r) => r.user_id && r.account_id)
        .map((r) => ({
          account_id: r.account_id as string,
          user_id: r.user_id as string,
          type: "announcement" as const,
          title,
          body: text,
        }));

      if (rows.length > 0) {
        // En lotes por si es toda la plataforma.
        const CHUNK = 500;
        for (let i = 0; i < rows.length; i += CHUNK) {
          const { error: notifErr } = await db.from("notifications").insert(rows.slice(i, i + CHUNK));
          if (notifErr) console.error("[POST /announcements] notifications insert error:", notifErr);
        }
      }
    }

    await logPlatformAdminAction({
      adminUserId: admin.userId,
      adminEmail: admin.email,
      action: "create_announcement",
      metadata: { title, audience, sendNotification },
    });

    return NextResponse.json({ id: announcement.id });
  } catch (err) {
    return toErrorResponse(err);
  }
}
