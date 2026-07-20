import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { getStripeClient } from "@/lib/billing-platform/stripe";
import { PLAN_CONFIG, type Plan } from "@/lib/billing-platform/plans";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * POST /api/billing-platform/seats/add — the "agregar asiento" action
 * offered when an owner tries to invite past `included_seats` on a
 * paid plan (see InviteMemberDialog). Owner-only, same as
 * Checkout/Portal — this changes what the account gets billed.
 *
 * Finds the account's active Stripe subscription and either bumps the
 * existing seat-addon line item's quantity or creates it at quantity
 * 1 if this is the first overage seat. Stripe prorates the charge
 * onto the current billing cycle automatically
 * (`proration_behavior: "create_prorations"`), same as the Customer
 * Portal would.
 */
export async function POST() {
  try {
    const ctx = await requireRole("owner");

    const limit = checkRateLimit(`platformBilling:addSeat:${ctx.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const { data: row, error: rowErr } = await ctx.supabase
      .from("accounts")
      .select("stripe_subscription_id, plan")
      .eq("id", ctx.accountId)
      .single();

    if (rowErr || !row?.stripe_subscription_id) {
      return NextResponse.json(
        { error: "This account has no active subscription to add a seat to. Activate a plan first." },
        { status: 400 },
      );
    }

    const plan = row.plan as Plan;
    const seatPriceId = PLAN_CONFIG[plan]?.stripeSeatPriceId;
    if (!seatPriceId) {
      return NextResponse.json(
        { error: "This plan isn't configured for extra seats" },
        { status: 400 },
      );
    }

    const stripe = getStripeClient();
    const subscription = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
    const existingItem = subscription.items.data.find((item) => item.price.id === seatPriceId);

    if (existingItem) {
      await stripe.subscriptionItems.update(existingItem.id, {
        quantity: (existingItem.quantity ?? 0) + 1,
        proration_behavior: "create_prorations",
      });
    } else {
      await stripe.subscriptionItems.create({
        subscription: row.stripe_subscription_id,
        price: seatPriceId,
        quantity: 1,
        proration_behavior: "create_prorations",
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
