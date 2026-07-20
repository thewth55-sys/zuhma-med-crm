import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { getStripeClient } from "@/lib/billing-platform/stripe";
import { PLAN_CONFIG, type Plan } from "@/lib/billing-platform/plans";

const PURCHASABLE_PLANS: Plan[] = ["standalone", "zentro_salud_starter", "zentro_salud_pro"];

/**
 * POST /api/billing-platform/checkout — starts a Stripe Checkout
 * session for a purchasable plan. Owner-only: billing is the one
 * action in this app that isn't gated by the usual agent/admin
 * ladder, it's gated by literally owning the account.
 *
 * If the account already has team members beyond the plan's included
 * seats (e.g. invited during the trial), the extra-seat line item is
 * pre-populated with that quantity so Checkout charges correctly from
 * day one instead of under-billing until the next seat change.
 *
 * `allowSuspended` so a suspended account can still activate a plan —
 * that's the intended way out of a suspension, not a bypass.
 */
export async function POST(request: Request) {
  try {
    const { supabase, userId, account } = await requireRole("owner", { allowSuspended: true });
    const body = await request.json().catch(() => ({}));
    const plan = body.plan as Plan;

    if (!PURCHASABLE_PLANS.includes(plan)) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const config = PLAN_CONFIG[plan];
    const stripe = getStripeClient();

    let customerId = account.stripeCustomerId;
    if (!customerId) {
      const { data: userData } = await supabase.auth.getUser();
      const customer = await stripe.customers.create({
        email: userData.user?.email,
        metadata: { account_id: account.id },
      });
      customerId = customer.id;
      await supabase.from("accounts").update({ stripe_customer_id: customerId }).eq("id", account.id);
    }

    const { count: seatCount } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("account_id", account.id);

    const extraSeats = Math.max(0, (seatCount ?? 1) - config.includedSeats);

    const lineItems: { price: string; quantity: number }[] = [];
    if (config.stripeBasePriceId) {
      lineItems.push({ price: config.stripeBasePriceId, quantity: 1 });
    }
    if (config.stripeSeatPriceId && extraSeats > 0) {
      lineItems.push({ price: config.stripeSeatPriceId, quantity: extraSeats });
    }

    if (lineItems.length === 0) {
      return NextResponse.json(
        { error: "This plan isn't configured with Stripe prices yet" },
        { status: 500 }
      );
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || "https://med.zentrolabs.com";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: lineItems,
      // Lets a customer type in a staff-generated promo code
      // (/admin/coupons) themselves at Stripe's hosted page — no admin
      // action needed for the self-service discount path.
      allow_promotion_codes: true,
      success_url: `${siteUrl}/settings?tab=billing-platform&checkout=success`,
      cancel_url: `${siteUrl}/settings?tab=billing-platform&checkout=canceled`,
      subscription_data: {
        metadata: { account_id: account.id, plan, created_by: userId },
      },
      metadata: { account_id: account.id, plan },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    return toErrorResponse(err);
  }
}
