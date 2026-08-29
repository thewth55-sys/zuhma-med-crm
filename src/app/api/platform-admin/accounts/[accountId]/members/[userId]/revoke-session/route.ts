// ============================================================
// POST /api/platform-admin/accounts/[accountId]/members/[userId]/revoke-session
//
// "Remote sign-out" for a team member. Supabase's admin API has no
// per-user "kill all active sessions" call (auth.admin.signOut needs
// the session's own JWT, which we never store) — the real lever here
// is a short ban_duration, which blocks the user from refreshing
// their session or logging back in for that window, then lifts
// itself automatically. Their CURRENT access token can remain valid
// until it naturally expires (Supabase's default is ~1h) since JWTs
// are verified statelessly — this is a "cut off new access", not an
// instant kill of an already-issued token. The UI copy says this
// plainly so it doesn't read as a stronger guarantee than it is.
// ============================================================

import { NextResponse } from "next/server";

import { requirePlatformAdmin, logPlatformAdminAction } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/supabase/admin-client";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

const BAN_DURATION = "1m";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ accountId: string; userId: string }> },
) {
  try {
    const admin = await requirePlatformAdmin();
    const { accountId, userId } = await params;

    const limit = checkRateLimit(`platformAdmin:revokeSession:${admin.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

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

    const { error } = await db.auth.admin.updateUserById(userId, { ban_duration: BAN_DURATION });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await logPlatformAdminAction({
      adminUserId: admin.userId,
      adminEmail: admin.email,
      action: "revoke_member_session",
      targetAccountId: accountId,
      targetUserId: userId,
      metadata: { banDuration: BAN_DURATION },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
