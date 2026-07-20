import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { getStripeClient } from "@/lib/billing-platform/stripe";

/**
 * POST /api/billing-platform/portal — opens Stripe's hosted Customer
 * Portal so the account owner can change plan, update the card, or
 * cancel without support intervention. Owner-only, same as Checkout.
 * `allowSuspended` so a suspended account can still reach the portal
 * to sort out billing (e.g. update a card) as part of paying its way
 * out of the suspension.
 */
export async function POST() {
  try {
    const { account } = await requireRole("owner", { allowSuspended: true });

    const customerId = account.stripeCustomerId;
    if (!customerId) {
      return NextResponse.json(
        { error: "No active subscription to manage yet" },
        { status: 400 }
      );
    }

    const stripe = getStripeClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || "https://med.zentrolabs.com";

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${siteUrl}/settings?tab=billing-platform`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    return toErrorResponse(err);
  }
}
