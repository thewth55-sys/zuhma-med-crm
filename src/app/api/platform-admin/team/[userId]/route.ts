// ============================================================
// DELETE /api/platform-admin/team/[userId] — revokes platform-admin
// access. Refuses to remove the last remaining admin so the panel
// can never lock everyone out of itself.
// ============================================================

import { NextResponse } from "next/server";

import { requirePlatformAdmin, requireStaffRole, logPlatformAdminAction, type StaffRole } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/supabase/admin-client";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

const STAFF_ROLES: StaffRole[] = ["global", "support", "dev", "qa", "customer_success", "marketing"];

/**
 * PATCH /api/platform-admin/team/[userId] — reassign a staff member's
 * role. Only 'global' admins can do this (not even the target's own
 * role, e.g. a 'marketing' admin can't promote themselves) — role
 * assignment is itself a privileged action, gated tighter than the
 * rest of /admin/team.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const admin = await requireStaffRole(["global"]);
    const { userId } = await params;

    const limit = checkRateLimit(`platformAdmin:team:setRole:${admin.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as { role?: string } | null;
    if (!body?.role || !STAFF_ROLES.includes(body.role as StaffRole)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const db = supabaseAdmin();

    if (body.role !== "global") {
      const { count } = await db
        .from("platform_admins")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "global")
        .neq("user_id", userId);
      if ((count ?? 0) < 1) {
        return NextResponse.json(
          { error: "No puedes quitarle el rol global al último administrador global" },
          { status: 400 },
        );
      }
    }

    const { error } = await db.from("platform_admins").update({ role: body.role }).eq("user_id", userId);
    if (error) {
      console.error("[PATCH /api/platform-admin/team] role update error:", error);
      return NextResponse.json({ error: "No se pudo actualizar el rol" }, { status: 500 });
    }

    await logPlatformAdminAction({
      adminUserId: admin.userId,
      adminEmail: admin.email,
      action: "set_staff_role",
      targetUserId: userId,
      metadata: { role: body.role },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}

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
