// ============================================================
// POST /api/platform-admin/accounts/[accountId]/tags — adds an
// internal label to an account (Cuenta 360 panel).
// ============================================================

import { NextResponse } from "next/server";

import { requirePlatformAdmin, logPlatformAdminAction } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/billing-platform/admin-client";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const admin = await requirePlatformAdmin();
    const { accountId } = await params;

    const limit = checkRateLimit(`platformAdmin:tags:add:${admin.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = await request.json().catch(() => null);
    const label = typeof body?.label === "string" ? body.label.trim() : "";
    if (!label || label.length > 40) {
      return NextResponse.json({ error: "Etiqueta inválida (1-40 caracteres)" }, { status: 400 });
    }

    const db = supabaseAdmin();
    const { data: tag, error } = await db
      .from("account_tags")
      .insert({ account_id: accountId, label, created_by: admin.userId })
      .select("id, label")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "Esa etiqueta ya existe en esta cuenta" }, { status: 409 });
      }
      console.error("[POST /api/platform-admin/accounts/:id/tags] insert error:", error);
      return NextResponse.json({ error: "No se pudo agregar la etiqueta" }, { status: 500 });
    }

    await logPlatformAdminAction({
      adminUserId: admin.userId,
      adminEmail: admin.email,
      action: "add_account_tag",
      targetAccountId: accountId,
      metadata: { label },
    });

    return NextResponse.json({ tag });
  } catch (err) {
    return toErrorResponse(err);
  }
}
