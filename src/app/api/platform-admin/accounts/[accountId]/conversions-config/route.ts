// ============================================================
// PATCH /api/platform-admin/accounts/[accountId]/conversions-config
//
// Lets a platform admin set up an account's Meta Conversions API +
// Google Ads tracking on their behalf — same table/encryption as the
// client's own Settings → Conversions form
// (conversion_tracking_config, meta_access_token AES-256-GCM at
// rest), just upserted through the service-role client. No live
// validation call here (the client route doesn't have one either —
// there's a separate manual "test event" action for that).
// ============================================================

import { NextResponse } from "next/server";

import { requirePlatformAdmin, logPlatformAdminAction } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/supabase/admin-client";
import { encrypt } from "@/lib/whatsapp/encryption";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

export async function PATCH(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const admin = await requirePlatformAdmin();
    const { accountId } = await params;

    const limit = checkRateLimit(`platformAdmin:conversionsConfig:${admin.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const db = supabaseAdmin();

    const { data: existing } = await db
      .from("conversion_tracking_config")
      .select("meta_access_token")
      .eq("account_id", accountId)
      .maybeSingle();

    const rawToken = typeof body.metaAccessToken === "string" ? body.metaAccessToken.trim() : "";
    const metaAccessToken = rawToken ? encrypt(rawToken) : (existing?.meta_access_token ?? null);

    const row = {
      account_id: accountId,
      created_by: admin.userId,
      meta_pixel_id: typeof body.metaPixelId === "string" ? body.metaPixelId.trim() || null : null,
      meta_access_token: metaAccessToken,
      meta_test_event_code: typeof body.metaTestEventCode === "string" ? body.metaTestEventCode.trim() || null : null,
      meta_track_lead_created: body.metaTrackLeadCreated === true,
      meta_track_deal_won: body.metaTrackDealWon === true,
      meta_track_first_reply: body.metaTrackFirstReply === true,
      meta_track_automations: body.metaTrackAutomations === true,
      google_ads_conversion_id:
        typeof body.googleAdsConversionId === "string" ? body.googleAdsConversionId.trim() || null : null,
      google_ads_lead_created_label:
        typeof body.googleAdsLeadCreatedLabel === "string" ? body.googleAdsLeadCreatedLabel.trim() || null : null,
      google_ads_deal_won_label:
        typeof body.googleAdsDealWonLabel === "string" ? body.googleAdsDealWonLabel.trim() || null : null,
      google_ads_first_reply_label:
        typeof body.googleAdsFirstReplyLabel === "string" ? body.googleAdsFirstReplyLabel.trim() || null : null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await db.from("conversion_tracking_config").upsert(row, { onConflict: "account_id" });

    if (error) {
      console.error("[PATCH /api/platform-admin/accounts/:id/conversions-config] upsert error:", error);
      return NextResponse.json({ error: "No se pudo guardar la configuración" }, { status: 500 });
    }

    await logPlatformAdminAction({
      adminUserId: admin.userId,
      adminEmail: admin.email,
      action: "set_conversions_config",
      targetAccountId: accountId,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
