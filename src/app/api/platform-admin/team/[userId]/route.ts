// ============================================================
// DELETE /api/platform-admin/team/[userId] — revokes platform-admin
// access. Refuses to remove the last remaining admin so the panel
// can never lock everyone out of itself.
// ============================================================

import { NextResponse } from "next/server";

import { requirePlatformAdmin, logPlatformAdminAction } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/billing-platform/admin-client";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

export async function DELETE(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const admin = await requirePlatformAdmin();
    const { userId } = await params;

    const limit = checkRateLimit(`platformAdmin:team:revoke:${admin.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const db = supabaseAdmin();

    const { count, error: countErr } = await db
      .from("platform_admins")
      .select("user_id", { count: "exact", head: true });

    if (countErr) {
      console.error("[DELETE /api/platform-admin/team] count error:", countErr);
      return NextResponse.json({ error: "No se pudo verificar el equipo" }, { status: 500 });
    }
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "No puedes quitar al último administrador de la plataforma" },
        { status: 400 },
      );
    }

    const { error: deleteErr } = await db.from("platform_admins").delete().eq("user_id", userId);
    if (deleteErr) {
      console.error("[DELETE /api/platform-admin/team] delete error:", deleteErr);
      return NextResponse.json({ error: "No se pudo quitar el acceso" }, { status: 500 });
    }

    await logPlatformAdminAction({
      adminUserId: admin.userId,
      adminEmail: admin.email,
      action: "revoke_platform_admin",
      targetUserId: userId,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
