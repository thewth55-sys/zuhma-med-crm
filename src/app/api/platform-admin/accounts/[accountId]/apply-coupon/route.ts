import { NextResponse } from "next/server";

import { requirePlatformAdmin, resolveAccountOwner, logPlatformAdminAction } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/billing-platform/admin-client";
import { getStripeClient } from "@/lib/billing-platform/stripe";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * POST /api/platform-admin/accounts/[accountId]/apply-coupon
 * body: { couponId: string }
 *
 * Applies an existing coupon directly to this account's live Stripe
 * subscription — the "give this specific paying customer a courtesy
 * discount" path. Distinct from set-plan's full-comp mechanism (which
 * bypasses Stripe billing entirely): this keeps the account on real
 * Stripe billing, just at a discount, so invoices/payment history stay
 * accurate. Requires the account to actually have a Stripe
 * subscription — a fully-comped account (no stripe_subscription_id)
 * has nothing for a coupon to attach to; use set-plan for those.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    const admin = await requirePlatformAdmin();
    const { accountId } = await params;

    const limit = checkRateLimit(`platformAdmin:applyCoupon:${admin.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as { couponId?: unknown } | null;
    const couponId = typeof body?.couponId === "string" ? body.couponId : "";
    if (!couponId) {
      return NextResponse.json({ error: "couponId is required" }, { status: 400 });
    }

    const db = supabaseAdmin();
    const { data: account } = await db
      .from("accounts")
      .select("stripe_subscription_id")
      .eq("id", accountId)
      .maybeSingle();
    if (!account?.stripe_subscription_id) {
      return NextResponse.json(
        { error: "This account has no active Stripe subscription to apply a coupon to. Use 'Set plan' for a full comp instead." },
        { status: 400 },
      );
    }

    const { data: coupon } = await db
      .from("discount_coupons")
      .select("code, stripe_coupon_id")
      .eq("id", couponId)
      .maybeSingle();
    if (!coupon) {
      return NextResponse.json({ error: "Coupon not found" }, { status: 404 });
    }

    const owner = await resolveAccountOwner(accountId);
    if (!owner) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const stripe = getStripeClient();
    try {
      await stripe.subscriptions.update(account.stripe_subscription_id, {
        discounts: [{ coupon: coupon.stripe_coupon_id }],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown Stripe error";
      return NextResponse.json({ error: `Stripe error: ${message}` }, { status: 400 });
    }

    await logPlatformAdminAction({
      adminUserId: admin.userId,
      adminEmail: admin.email,
      action: "apply_coupon",
      targetAccountId: owner.accountId,
      targetUserId: owner.ownerUserId,
      metadata: { accountName: owner.accountName, couponCode: coupon.code },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
