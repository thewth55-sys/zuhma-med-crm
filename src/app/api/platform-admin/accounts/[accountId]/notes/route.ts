// ============================================================
// POST /api/platform-admin/accounts/[accountId]/notes — adds an
// internal note to an account (Cuenta 360 panel).
// ============================================================

import { NextResponse } from "next/server";

import { requirePlatformAdmin, logPlatformAdminAction } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/supabase/admin-client";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const admin = await requirePlatformAdmin();
    const { accountId } = await params;

    const limit = checkRateLimit(`platformAdmin:notes:add:${admin.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = await request.json().catch(() => null);
    const text = typeof body?.body === "string" ? body.body.trim() : "";
    if (!text || text.length > 2000) {
      return NextResponse.json({ error: "Nota inválida (1-2000 caracteres)" }, { status: 400 });
    }

    const db = supabaseAdmin();
    const { data: note, error } = await db
      .from("account_notes")
      .insert({ account_id: accountId, author_user_id: admin.userId, body: text })
      .select("id, body, created_at")
      .single();

    if (error) {
      console.error("[POST /api/platform-admin/accounts/:id/notes] insert error:", error);
      return NextResponse.json({ error: "No se pudo agregar la nota" }, { status: 500 });
    }

    await logPlatformAdminAction({
      adminUserId: admin.userId,
      adminEmail: admin.email,
      action: "add_account_note",
      targetAccountId: accountId,
    });

    return NextResponse.json({
      note: { id: note.id, body: note.body, authorName: admin.email, createdAt: note.created_at },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
