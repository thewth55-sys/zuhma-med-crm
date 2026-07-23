import { NextResponse } from "next/server";

import { requirePlatformAdmin, resolveAccountOwner, logPlatformAdminAction } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/supabase/admin-client";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import {
  generateActivationCode,
  hashActivationCode,
  activationCodeExpiryFromNow,
} from "@/lib/auth/activation-code";
import { sendActivationCodeEmail } from "@/lib/email/activation-email";

/**
 * POST /api/platform-admin/accounts/[accountId]/resend-activation
 *
 * Re-issues the owner's activation CODE and emails it again — for an
 * owner who never completed onboarding or whose code expired. Generates
 * a fresh code (invalidating any previous one), stores its hash on the
 * account, and sends it via Resend. The owner completes signup at
 * /activar (password + T&C).
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

    const db = supabaseAdmin();

    // Fresh code invalidates any prior one and resets the used flag.
    const code = generateActivationCode();
    const { error: updateErr } = await db
      .from("accounts")
      .update({
        activation_code_hash: hashActivationCode(code),
        activation_code_expires_at: activationCodeExpiryFromNow(),
        activation_code_used_at: null,
      })
      .eq("id", owner.accountId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || "https://medcrm.zuhma.online";

    try {
      await sendActivationCodeEmail({ to: owner.ownerEmail, code, baseUrl });
    } catch (sendErr) {
      const message = sendErr instanceof Error ? sendErr.message : "Error enviando el correo";
      console.error("[resend-activation] send failed:", message);
      return NextResponse.json({ error: `No se pudo enviar el correo: ${message}` }, { status: 502 });
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
