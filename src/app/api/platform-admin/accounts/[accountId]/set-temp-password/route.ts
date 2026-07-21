import { NextResponse } from "next/server";
import crypto from "crypto";

import { requirePlatformAdmin, resolveAccountOwner, logPlatformAdminAction } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/supabase/admin-client";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * POST /api/platform-admin/accounts/[accountId]/set-temp-password
 *
 * Sets a fresh, strong temporary password on the account owner and
 * returns it to the admin **once** (never stored, never logged). For
 * owners who can't complete the one-time email link flow at all —
 * e.g. their mailbox's link scanner keeps consuming the recovery OTP
 * (`otp_expired`). The admin shares the password out-of-band and the
 * owner changes it after logging in.
 *
 * Replaces the owner's current password, so it's confirmed on the
 * client before firing. The audit log records that it happened and
 * for whom — but the password value only ever exists in this response.
 */

// Ambiguity-free charset (no 0/O/1/l/I) across upper, lower, digit and
// symbol so the result comfortably clears any password-strength floor.
const PASSWORD_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#%+=?";

function generateTempPassword(length = 14): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += PASSWORD_CHARSET[bytes[i] % PASSWORD_CHARSET.length];
  }
  return out;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    const admin = await requirePlatformAdmin();
    const { accountId } = await params;

    const limit = checkRateLimit(
      `platformAdmin:setTempPassword:${admin.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const owner = await resolveAccountOwner(accountId);
    if (!owner) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const password = generateTempPassword();

    const { error: updateErr } = await supabaseAdmin().auth.admin.updateUserById(
      owner.ownerUserId,
      { password },
    );

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }

    await logPlatformAdminAction({
      adminUserId: admin.userId,
      adminEmail: admin.email,
      action: "set_temp_password",
      targetAccountId: owner.accountId,
      targetUserId: owner.ownerUserId,
      // Never log the password itself — only that the action happened.
      metadata: { accountName: owner.accountName, targetEmail: owner.ownerEmail },
    });

    return NextResponse.json({ ok: true, password });
  } catch (err) {
    return toErrorResponse(err);
  }
}
