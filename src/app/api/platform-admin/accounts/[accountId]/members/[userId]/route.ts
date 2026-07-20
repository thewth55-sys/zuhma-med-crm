// ============================================================
// PATCH /api/platform-admin/accounts/[accountId]/members/[userId]
//
// Lets a platform admin correct a team member's email or phone from
// the Cuenta 360 panel — support scenarios like a typo'd signup email
// or an outdated contact number, where the member themselves can't
// self-serve (locked out, or the field isn't exposed in their own
// Settings). Email changes go through Supabase Auth (the source of
// truth for login) with `email_confirm: true` so an admin-asserted
// correction doesn't also trigger a customer-facing "confirm your new
// email" flow; `profiles.email` is kept in sync since it's a
// denormalized read copy used across the app's own UI.
// ============================================================

import { NextResponse } from "next/server";

import { requirePlatformAdmin, logPlatformAdminAction } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/billing-platform/admin-client";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ accountId: string; userId: string }> },
) {
  try {
    const admin = await requirePlatformAdmin();
    const { accountId, userId } = await params;

    const limit = checkRateLimit(`platformAdmin:memberEdit:${admin.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = await request.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim() : undefined;
    const phone = typeof body?.phone === "string" ? body.phone.trim() : undefined;

    if (email !== undefined && (!email || !email.includes("@"))) {
      return NextResponse.json({ error: "Correo inválido" }, { status: 400 });
    }

    const db = supabaseAdmin();

    // Belt-and-braces: confirm this user actually belongs to this
    // account before touching their auth record, so a typo'd
    // accountId in the URL can't be used to edit an unrelated user.
    const { data: profile } = await db
      .from("profiles")
      .select("user_id")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .maybeSingle();
    if (!profile) {
      return NextResponse.json({ error: "Ese usuario no pertenece a esta cuenta" }, { status: 404 });
    }

    if (email !== undefined) {
      const { error: authErr } = await db.auth.admin.updateUserById(userId, {
        email,
        email_confirm: true,
      });
      if (authErr) {
        return NextResponse.json({ error: authErr.message }, { status: 400 });
      }
    }

    const profileUpdate: Record<string, string> = {};
    if (email !== undefined) profileUpdate.email = email;
    if (phone !== undefined) profileUpdate.phone = phone;

    if (Object.keys(profileUpdate).length > 0) {
      const { error: profileErr } = await db.from("profiles").update(profileUpdate).eq("user_id", userId);
      if (profileErr) {
        console.error("[PATCH /api/platform-admin/accounts/:id/members/:userId] profile update error:", profileErr);
        return NextResponse.json({ error: "No se pudo actualizar el perfil" }, { status: 500 });
      }
    }

    await logPlatformAdminAction({
      adminUserId: admin.userId,
      adminEmail: admin.email,
      action: "edit_member_contact",
      targetAccountId: accountId,
      targetUserId: userId,
      metadata: { emailChanged: email !== undefined, phoneChanged: phone !== undefined },
    });

    return NextResponse.json({ ok: true, email, phone });
  } catch (err) {
    return toErrorResponse(err);
  }
}
