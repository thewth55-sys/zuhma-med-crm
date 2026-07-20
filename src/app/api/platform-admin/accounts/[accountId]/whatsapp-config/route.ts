// ============================================================
// PATCH /api/platform-admin/accounts/[accountId]/whatsapp-config
//
// Lets a platform admin connect/fix an account's WhatsApp Business
// API credentials on their behalf — the embedded-signup and manual
// flows both assume the end user has a Meta Business Manager and can
// navigate it, which most clinic staff can't. Drives the exact same
// verify/register/subscribe orchestration as the client's own
// Settings form (`saveWhatsAppConfig`), just through the service-role
// client instead of the caller's own RLS-scoped session.
// ============================================================

import { NextResponse } from "next/server";

import { requirePlatformAdmin, logPlatformAdminAction, resolveAccountOwner } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/billing-platform/admin-client";
import { saveWhatsAppConfig } from "@/lib/whatsapp/save-config";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

export async function PATCH(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const admin = await requirePlatformAdmin();
    const { accountId } = await params;

    const limit = checkRateLimit(`platformAdmin:whatsappConfig:${admin.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const owner = await resolveAccountOwner(accountId);
    if (!owner) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const result = await saveWhatsAppConfig({
      supabase: supabaseAdmin(),
      accountId,
      savedByUserId: owner.ownerUserId,
      phoneNumberId: typeof body?.phoneNumberId === "string" ? body.phoneNumberId.trim() : "",
      wabaId: typeof body?.wabaId === "string" ? body.wabaId.trim() : null,
      accessToken: typeof body?.accessToken === "string" ? body.accessToken.trim() : "",
      verifyToken: typeof body?.verifyToken === "string" ? body.verifyToken.trim() : null,
      pin: typeof body?.pin === "string" ? body.pin.trim() : null,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.errorStatus ?? 400 });
    }

    await logPlatformAdminAction({
      adminUserId: admin.userId,
      adminEmail: admin.email,
      action: "set_whatsapp_config",
      targetAccountId: accountId,
      metadata: { registered: result.registered, registrationError: result.registrationError },
    });

    if (result.registrationError) {
      return NextResponse.json({
        success: false,
        registered: false,
        registrationError: result.registrationError,
      });
    }

    return NextResponse.json({
      success: true,
      registered: result.registered,
      registrationSkipped: result.registrationSkipped,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
