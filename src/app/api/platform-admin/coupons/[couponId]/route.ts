import { NextResponse } from "next/server";

import { requirePlatformAdmin, logPlatformAdminAction } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/billing-platform/admin-client";
import { getStripeClient } from "@/lib/billing-platform/stripe";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * PATCH /api/platform-admin/coupons/[couponId]
 * body: { active: boolean }
 *
 * Deactivating a promotion code stops it being redeemable — it does
 * NOT delete the coupon or affect subscriptions that already redeemed
 * it (same as Stripe's own dashboard toggle).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ couponId: string }> },
) {
  try {
    const admin = await requirePlatformAdmin();
    const { couponId } = await params;

    const limit = checkRateLimit(`platformAdmin:toggleCoupon:${admin.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as { active?: unknown } | null;
    if (typeof body?.active !== "boolean") {
      return NextResponse.json({ error: "'active' must be a boolean" }, { status: 400 });
    }

    const db = supabaseAdmin();
    const { data: row } = await db
      .from("discount_coupons")
      .select("code, stripe_promotion_code_id")
      .eq("id", couponId)
      .maybeSingle();
    if (!row) {
      return NextResponse.json({ error: "Coupon not found" }, { status: 404 });
    }

    const stripe = getStripeClient();
    await stripe.promotionCodes.update(row.stripe_promotion_code_id, { active: body.active });

    const { error } = await db.from("discount_coupons").update({ active: body.active }).eq("id", couponId);
    if (error) {
      console.error("[PATCH /api/platform-admin/coupons/:id] update error:", error);
      return NextResponse.json({ error: "Failed to update coupon" }, { status: 500 });
    }

    await logPlatformAdminAction({
      adminUserId: admin.userId,
      adminEmail: admin.email,
      action: body.active ? "reactivate_coupon" : "deactivate_coupon",
      metadata: { code: row.code },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
