// ============================================================
// DELETE /api/platform-admin/accounts/[accountId]/tags/[tagId] —
// removes an internal label from an account.
// ============================================================

import { NextResponse } from "next/server";

import { requirePlatformAdmin, logPlatformAdminAction } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/supabase/admin-client";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ accountId: string; tagId: string }> },
) {
  try {
    const admin = await requirePlatformAdmin();
    const { accountId, tagId } = await params;

    const db = supabaseAdmin();
    const { error } = await db.from("account_tags").delete().eq("id", tagId).eq("account_id", accountId);

    if (error) {
      console.error("[DELETE /api/platform-admin/accounts/:id/tags/:tagId] delete error:", error);
      return NextResponse.json({ error: "No se pudo quitar la etiqueta" }, { status: 500 });
    }

    await logPlatformAdminAction({
      adminUserId: admin.userId,
      adminEmail: admin.email,
      action: "remove_account_tag",
      targetAccountId: accountId,
      metadata: { tagId },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
