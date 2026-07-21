import { NextResponse } from "next/server";

import { requirePlatformAdmin, resolveAccountOwner, logPlatformAdminAction } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/supabase/admin-client";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * POST /api/platform-admin/accounts/[accountId]/resend-activation
 *
 * Re-sends an activation link to an account owner who never completed
 * their invite (spam filter, dead-domain link, typo'd retry, etc.).
 *
 * Accounts are created with `inviteUserByEmail`, so the owner already
 * exists — which rules out every "new user" mechanism we tried before:
 *   - `auth.resend({type:'signup'})` silently no-ops for an invited
 *     user (no pending *signup* confirmation) — the original bug: it
 *     logged success but never sent.
 *   - `generateLink({type:'invite'})` errors "already registered".
 *   - `generateLink({type:'recovery'})` DOES send, but returns an
 *     *implicit-flow* link (`#access_token` in the URL fragment). Our
 *     `/auth/callback` only handles the *PKCE* `?code=` exchange, so
 *     that link can't establish a session there and bounced the owner
 *     to `/login` with `otp_expired`.
 *
 * So we use the exact path the working forgot-password page and the
 * platform-admin "reset password" action already use:
 * `resetPasswordForEmail()`. GoTrue sends the (Zuhma-branded) recovery
 * email over the configured SMTP and produces a PKCE `?code=` link that
 * `/auth/callback` exchanges, landing the owner on `/reset-password` to
 * set their password — same activation outcome, on a proven flow.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    const admin = await requirePlatformAdmin();
    const { accountId } = await params;

    const limit = checkRateLimit(
      `platformAdmin:resendActivation:${admin.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const owner = await resolveAccountOwner(accountId);
    if (!owner) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || "https://medcrm.zuhma.online";

    const { error: resetErr } = await supabaseAdmin().auth.resetPasswordForEmail(owner.ownerEmail, {
      redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
    });

    if (resetErr) {
      return NextResponse.json({ error: resetErr.message }, { status: 400 });
    }

    await logPlatformAdminAction({
      adminUserId: admin.userId,
      adminEmail: admin.email,
      action: "resend_activation",
      targetAccountId: owner.accountId,
      targetUserId: owner.ownerUserId,
      metadata: { accountName: owner.accountName, targetEmail: owner.ownerEmail },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
