import { NextResponse } from "next/server";

import { requirePlatformAdmin, logPlatformAdminAction } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/billing-platform/admin-client";
import { getStripeClient } from "@/lib/billing-platform/stripe";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * GET /api/platform-admin/coupons — lists every coupon this platform
 * has created, refreshing `active`/`times_redeemed` live from Stripe
 * (the source of truth for redemption state) rather than trusting a
 * potentially-stale local copy. The list is always small (staff-
 * created, not customer-facing volume), so one Stripe call per row is
 * cheap enough to not bother caching.
 *
 * POST /api/platform-admin/coupons — creates a Stripe Coupon +
 * Promotion Code pair (the actual discount mechanism customers redeem
 * — see Stripe's docs on the distinction) and mirrors it locally.
 * body: {
 *   code: string,
 *   description?: string,
 *   discountType: 'percent' | 'amount',
 *   percentOff?: number,        // 1-100, required if discountType === 'percent'
 *   amountOffCents?: number,    // required if discountType === 'amount'
 *   currency?: string,          // required if discountType === 'amount'
 *   duration: 'once' | 'repeating' | 'forever',
 *   durationInMonths?: number,  // required if duration === 'repeating'
 *   maxRedemptions?: number | null,
 *   expiresAt?: string | null,  // ISO date
 * }
 */
export async function GET() {
  try {
    await requirePlatformAdmin();
    const db = supabaseAdmin();

    const { data: coupons, error } = await db
      .from("discount_coupons")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GET /api/platform-admin/coupons] load error:", error);
      return NextResponse.json({ error: "Failed to load coupons" }, { status: 500 });
    }

    const stripe = getStripeClient();
    const enriched = await Promise.all(
      (coupons ?? []).map(async (c) => {
        try {
          const promo = await stripe.promotionCodes.retrieve(c.stripe_promotion_code_id);
          return { ...c, active: promo.active, times_redeemed: promo.times_redeemed };
        } catch (err) {
          console.error(`[GET /api/platform-admin/coupons] Stripe refresh failed for ${c.id}:`, err);
          return { ...c, times_redeemed: null };
        }
      }),
    );

    return NextResponse.json({
      coupons: enriched.map((c) => ({
        id: c.id,
        code: c.code,
        description: c.description,
        percentOff: c.percent_off,
        amountOffCents: c.amount_off_cents,
        currency: c.currency,
        duration: c.duration,
        durationInMonths: c.duration_in_months,
        maxRedemptions: c.max_redemptions,
        timesRedeemed: c.times_redeemed,
        expiresAt: c.expires_at,
        active: c.active,
        createdAt: c.created_at,
      })),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requirePlatformAdmin();

    const limit = checkRateLimit(`platformAdmin:createCoupon:${admin.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = await request.json().catch(() => ({}));
    const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
    const description = typeof body?.description === "string" ? body.description.trim() || null : null;
    const discountType = body?.discountType;
    const duration = body?.duration;
    const durationInMonths = body?.durationInMonths;
    const maxRedemptions = body?.maxRedemptions ?? null;
    const expiresAt = body?.expiresAt ?? null;

    if (!code) {
      return NextResponse.json({ error: "code is required" }, { status: 400 });
    }
    if (!["once", "repeating", "forever"].includes(duration)) {
      return NextResponse.json({ error: "duration must be once, repeating, or forever" }, { status: 400 });
    }
    if (duration === "repeating" && (!Number.isInteger(durationInMonths) || durationInMonths < 1)) {
      return NextResponse.json({ error: "durationInMonths is required for a repeating discount" }, { status: 400 });
    }

    let percentOff: number | null = null;
    let amountOffCents: number | null = null;
    let currency: string | null = null;
    if (discountType === "percent") {
      percentOff = Number(body?.percentOff);
      if (!Number.isFinite(percentOff) || percentOff <= 0 || percentOff > 100) {
        return NextResponse.json({ error: "percentOff must be between 1 and 100" }, { status: 400 });
      }
    } else if (discountType === "amount") {
      amountOffCents = Number(body?.amountOffCents);
      currency = typeof body?.currency === "string" ? body.currency.trim().toLowerCase() : "";
      if (!Number.isInteger(amountOffCents) || amountOffCents <= 0) {
        return NextResponse.json({ error: "amountOffCents must be a positive integer" }, { status: 400 });
      }
      if (!currency) {
        return NextResponse.json({ error: "currency is required for a fixed-amount discount" }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: "discountType must be 'percent' or 'amount'" }, { status: 400 });
    }

    const stripe = getStripeClient();

    const coupon = await stripe.coupons.create({
      name: description ?? code,
      percent_off: percentOff ?? undefined,
      amount_off: amountOffCents ?? undefined,
      currency: currency ?? undefined,
      duration,
      duration_in_months: duration === "repeating" ? durationInMonths : undefined,
      max_redemptions: maxRedemptions ?? undefined,
    });

    let promotionCode;
    try {
      promotionCode = await stripe.promotionCodes.create({
        promotion: { type: "coupon", coupon: coupon.id },
        code,
        max_redemptions: maxRedemptions ?? undefined,
        expires_at: expiresAt ? Math.floor(new Date(expiresAt).getTime() / 1000) : undefined,
      });
    } catch (err) {
      // Roll back the coupon so a duplicate-code failure doesn't leave an orphan behind.
      await stripe.coupons.del(coupon.id).catch(() => {});
      throw err;
    }

    const db = supabaseAdmin();
    const { data: row, error } = await db
      .from("discount_coupons")
      .insert({
        code,
        description,
        stripe_coupon_id: coupon.id,
        stripe_promotion_code_id: promotionCode.id,
        percent_off: percentOff,
        amount_off_cents: amountOffCents,
        currency,
        duration,
        duration_in_months: duration === "repeating" ? durationInMonths : null,
        max_redemptions: maxRedemptions,
        expires_at: expiresAt,
        created_by: admin.userId,
      })
      .select()
      .single();

    if (error) {
      console.error("[POST /api/platform-admin/coupons] insert error:", error);
      return NextResponse.json({ error: "Coupon created in Stripe but failed to save locally" }, { status: 500 });
    }

    await logPlatformAdminAction({
      adminUserId: admin.userId,
      adminEmail: admin.email,
      action: "create_coupon",
      metadata: { code, discountType, percentOff, amountOffCents, currency, duration },
    });

    return NextResponse.json({ ok: true, coupon: row });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create coupon";
    console.error("[POST /api/platform-admin/coupons] error:", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
