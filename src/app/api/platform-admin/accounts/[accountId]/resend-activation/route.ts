import { NextResponse } from "next/server";

import { requirePlatformAdmin, resolveAccountOwner, logPlatformAdminAction } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/supabase/admin-client";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { renderBrandedEmail, emailButton, escapeHtml } from "@/lib/email/branded-template";
import { sendEmail } from "@/lib/email/resend-client";

/**
 * POST /api/platform-admin/accounts/[accountId]/resend-activation
 *
 * Re-sends the activation email — for an owner who never clicked their
 * original invite (spam filter, dead-domain link, typo'd retry, etc.).
 *
 * Accounts are created with `inviteUserByEmail` (a GoTrue *invite*), so
 * the user already exists. That rules out the two mechanisms that only
 * work for brand-new users: `auth.resend({type:'signup'})` silently
 * no-ops (there's no pending *signup* confirmation for an invited user
 * — the previous bug: it logged success but never sent), and
 * `generateLink({type:'invite'})` errors "already registered".
 *
 * So we mint a **recovery** link (valid for an existing user, drops
 * them into the set-password flow at /auth/callback → /reset-password —
 * same activation outcome) and send it ourselves through Resend with
 * the branded template, instead of relying on GoTrue's SMTP for an
 * email type that wouldn't fire. `generateLink` only generates the
 * link; it does not send anything.
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

    const { data: link, error: linkErr } = await supabaseAdmin().auth.admin.generateLink({
      type: "recovery",
      email: owner.ownerEmail,
      options: {
        redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
      },
    });

    const actionLink = link?.properties?.action_link;
    if (linkErr || !actionLink) {
      return NextResponse.json(
        { error: linkErr?.message ?? "No se pudo generar el enlace de activación" },
        { status: 400 },
      );
    }

    const html = renderBrandedEmail({
      heading: "Activa tu cuenta",
      bodyHtml:
        `<p>Te dieron acceso a <strong>${escapeHtml(owner.accountName)}</strong> en Zuhma. ` +
        `Activa tu cuenta y define tu contraseña para empezar.</p>` +
        emailButton("Activar mi cuenta", actionLink) +
        `<p style="margin-top:20px; font-size:12px; color:#999;">Si el botón no funciona, ` +
        `copia y pega este enlace en tu navegador:<br>` +
        `<a href="${actionLink}" style="word-break:break-all;">${actionLink}</a></p>`,
      brandName: "Zuhma",
    });

    try {
      await sendEmail({
        to: owner.ownerEmail,
        subject: "Te invitaron a unirte a Zuhma",
        html,
      });
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
