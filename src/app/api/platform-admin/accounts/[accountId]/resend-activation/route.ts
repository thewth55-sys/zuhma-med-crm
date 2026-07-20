import { NextResponse } from "next/server";

import { requirePlatformAdmin, resolveAccountOwner, logPlatformAdminAction } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/billing-platform/admin-client";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * POST /api/platform-admin/accounts/[accountId]/resend-activation
 *
 * Re-sends the signup confirmation email — for an owner who never
 * clicked their original link (spam filter, typo'd retry, etc.) and
 * can't self-serve it because the "Create account" form only resends
 * on a fresh signUp() attempt. Errors if the email is already
 * confirmed; Supabase's own message surfaces to the admin as-is.
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

    const { error: resendErr } = await supabaseAdmin().auth.resend({
      type: "signup",
      email: owner.ownerEmail,
    });

    if (resendErr) {
      return NextResponse.json({ error: resendErr.message }, { status: 400 });
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
