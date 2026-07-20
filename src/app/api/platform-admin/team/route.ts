// ============================================================
// GET  /api/platform-admin/team — lists everyone in platform_admins.
// POST /api/platform-admin/team — grants platform-admin access to an
//                                  email, creating an admin-only user
//                                  (no clinic account) if it doesn't
//                                  exist yet.
//
// platform_admins users deliberately have no `profiles` row (that
// table requires account_id NOT NULL — see 017_account_sharing.sql),
// so email/name here comes from Supabase Auth itself via the
// service-role admin API, not from `profiles`.
// ============================================================

import { NextResponse } from "next/server";

import { requirePlatformAdmin, logPlatformAdminAction } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/billing-platform/admin-client";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

export async function GET() {
  try {
    await requirePlatformAdmin();
    const admin = supabaseAdmin();

    const { data: rows, error } = await admin
      .from("platform_admins")
      .select("user_id, created_at, invited_by")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[GET /api/platform-admin/team] fetch error:", error);
      return NextResponse.json({ error: "Failed to load team" }, { status: 500 });
    }

    const members = await Promise.all(
      (rows ?? []).map(async (row) => {
        const { data } = await admin.auth.admin.getUserById(row.user_id);
        return {
          userId: row.user_id,
          email: data?.user?.email ?? null,
          fullName: (data?.user?.user_metadata?.full_name as string | undefined) ?? null,
          createdAt: row.created_at,
          invitedBy: row.invited_by,
        };
      }),
    );

    return NextResponse.json({ members });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requirePlatformAdmin();

    const limit = checkRateLimit(`platformAdmin:team:invite:${admin.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = await request.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Correo inválido" }, { status: 400 });
    }

    const db = supabaseAdmin();

    // Try creating a brand-new admin-only user first — the common
    // case (internal hire with no clinic account). If one already
    // exists with this email (an existing account owner, or an
    // already-admin user), invite errors and we fall back to finding
    // their user_id instead of sending a second signup email.
    let userId: string;
    const { data: invited, error: inviteErr } = await db.auth.admin.inviteUserByEmail(email);

    if (invited?.user) {
      userId = invited.user.id;
    } else if (inviteErr?.message?.toLowerCase().includes("already been registered")) {
      let found: string | null = null;
      let page = 1;
      while (!found) {
        const { data: list, error: listErr } = await db.auth.admin.listUsers({ page, perPage: 200 });
        if (listErr || !list?.users?.length) break;
        const match = list.users.find((u) => u.email?.toLowerCase() === email);
        if (match) found = match.id;
        else if (list.users.length < 200) break;
        page += 1;
      }
      if (!found) {
        return NextResponse.json({ error: "No se pudo resolver el usuario existente" }, { status: 500 });
      }
      userId = found;
    } else {
      return NextResponse.json({ error: inviteErr?.message ?? "No se pudo invitar" }, { status: 400 });
    }

    const { error: insertErr } = await db
      .from("platform_admins")
      .upsert({ user_id: userId, invited_by: admin.userId }, { onConflict: "user_id" });

    if (insertErr) {
      console.error("[POST /api/platform-admin/team] insert error:", insertErr);
      return NextResponse.json({ error: "No se pudo agregar como admin" }, { status: 500 });
    }

    await logPlatformAdminAction({
      adminUserId: admin.userId,
      adminEmail: admin.email,
      action: "grant_platform_admin",
      targetUserId: userId,
      metadata: { email },
    });

    return NextResponse.json({ ok: true, userId });
  } catch (err) {
    return toErrorResponse(err);
  }
}
