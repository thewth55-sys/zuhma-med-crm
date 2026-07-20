// ============================================================
// GET /api/platform-admin/accounts/[accountId]/members/[userId]/history
//
// Per-user activity timeline for the Cuenta 360 panel: merges that
// user's login_events (their own sessions) with
// platform_admin_audit_log rows targeting them (actions staff took
// on their account, e.g. a password reset or session revoke) into
// one chronological feed.
// ============================================================

import { NextResponse } from "next/server";

import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/supabase/admin-client";

const LIMIT = 20;

const ACTION_LABEL: Record<string, string> = {
  impersonate: "Impersonación iniciada",
  resend_activation: "Reenvío de correo de activación",
  reset_password: "Restablecimiento de contraseña",
  edit_member_contact: "Corrección de correo/teléfono",
  revoke_member_session: "Sesión cerrada remotamente",
  set_ai_config: "Configuración de Agentes IA actualizada",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ accountId: string; userId: string }> },
) {
  try {
    await requirePlatformAdmin();
    const { accountId, userId } = await params;

    const db = supabaseAdmin();

    const { data: profile } = await db
      .from("profiles")
      .select("user_id")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .maybeSingle();
    if (!profile) {
      return NextResponse.json({ error: "Ese usuario no pertenece a esta cuenta" }, { status: 404 });
    }

    const [{ data: logins }, { data: adminActions }] = await Promise.all([
      db
        .from("login_events")
        .select("ip_address, browser, device, country, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(LIMIT),
      db
        .from("platform_admin_audit_log")
        .select("admin_email, action, metadata, created_at")
        .eq("target_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(LIMIT),
    ]);

    const events = [
      ...(logins ?? []).map((l) => ({
        type: "login" as const,
        description: "Inicio de sesión",
        detail: [l.browser, l.device, l.country].filter(Boolean).join(" · ") || l.ip_address || null,
        createdAt: l.created_at,
      })),
      ...(adminActions ?? []).map((a) => ({
        type: "admin_action" as const,
        description: ACTION_LABEL[a.action] ?? a.action,
        detail: a.admin_email ? `por ${a.admin_email}` : null,
        createdAt: a.created_at,
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ events: events.slice(0, LIMIT) });
  } catch (err) {
    return toErrorResponse(err);
  }
}
