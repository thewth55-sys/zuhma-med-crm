// ============================================================
// PATCH /api/platform-admin/accounts/[accountId]/feature-overrides
//
// Sets or clears a per-account force-on/force-off for a GatedFeature
// (057_account_feature_overrides.sql). `enabled: null` clears the key
// entirely, reverting to the plan default rather than pinning
// "enabled".
// ============================================================

import { NextResponse } from "next/server";

import { requirePlatformAdmin, logPlatformAdminAction } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/billing-platform/admin-client";
import { GATED_FEATURES, type FeatureOverrides, type GatedFeature } from "@/lib/billing-platform/features";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

export async function PATCH(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const admin = await requirePlatformAdmin();
    const { accountId } = await params;

    const limit = checkRateLimit(`platformAdmin:featureOverrides:${admin.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = await request.json().catch(() => null);
    const feature = body?.feature as GatedFeature | undefined;
    const enabled = body?.enabled as boolean | null | undefined;

    if (!feature || !GATED_FEATURES.includes(feature)) {
      return NextResponse.json({ error: "Feature inválida" }, { status: 400 });
    }
    if (enabled !== null && typeof enabled !== "boolean") {
      return NextResponse.json({ error: "enabled debe ser boolean o null" }, { status: 400 });
    }

    const db = supabaseAdmin();

    const { data: account, error: fetchErr } = await db
      .from("accounts")
      .select("feature_overrides")
      .eq("id", accountId)
      .maybeSingle();

    if (fetchErr || !account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const current = (account.feature_overrides as FeatureOverrides | null) ?? {};
    const next: FeatureOverrides = { ...current };
    if (enabled === null) {
      delete next[feature];
    } else {
      next[feature] = enabled;
    }

    const { error: updateErr } = await db
      .from("accounts")
      .update({ feature_overrides: next })
      .eq("id", accountId);

    if (updateErr) {
      console.error("[PATCH /api/platform-admin/accounts/:id/feature-overrides] update error:", updateErr);
      return NextResponse.json({ error: "No se pudo actualizar" }, { status: 500 });
    }

    await logPlatformAdminAction({
      adminUserId: admin.userId,
      adminEmail: admin.email,
      action: "set_feature_override",
      targetAccountId: accountId,
      metadata: { feature, enabled },
    });

    return NextResponse.json({ featureOverrides: next });
  } catch (err) {
    return toErrorResponse(err);
  }
}
