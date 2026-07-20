import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { getStripeClient } from "@/lib/billing-platform/stripe";
import { supabaseAdmin } from "@/lib/billing-platform/admin-client";
import type { SubscriptionStatus } from "@/lib/billing-platform/plans";

/**
 * POST /api/webhooks/stripe — the only place subscription lifecycle
 * events are allowed to change `accounts.plan`/`subscription_status`.
 * No user session (Stripe calls this directly), so every write here
 * goes through the service-role client and is gated purely by
 * signature verification, not RLS.
 *
 * Fase B (not built yet, see plan doc) hooks in right after each
 * successful account update below — it notifies the separate Zentro
 * Labs Portal that this client is now paid. Left as a comment marker
 * rather than a stub call so it's obvious nothing silently no-ops.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    console.error("[stripe webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const accountId = session.metadata?.account_id;
        const plan = session.metadata?.plan;
        if (!accountId || !plan || typeof session.subscription !== "string") break;

        await supabaseAdmin()
          .from("accounts")
          .update({
            plan,
            subscription_status: "active" satisfies SubscriptionStatus,
            stripe_subscription_id: session.subscription,
          })
          .eq("id", accountId);
        // Fase B: notify Portal that `accountId` is now paid (plan, status).
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const accountId = subscription.metadata?.account_id;
        if (!accountId) break;

        await supabaseAdmin()
          .from("accounts")
          .update({ subscription_status: mapStripeStatus(subscription.status) })
          .eq("id", accountId);
        // Fase B: notify Portal of the status change.
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const accountId = subscription.metadata?.account_id;
        if (!accountId) break;

        // `plan` is left as-is (a historical record of what they last
        // had) — `hasActiveAccess()` gates purely on subscription_status,
        // so 'canceled' already revokes access without needing to
        // reset plan back to 'trial' (which would misleadingly imply
        // a fresh 30-day trial).
        await supabaseAdmin()
          .from("accounts")
          .update({ subscription_status: "canceled" satisfies SubscriptionStatus })
          .eq("id", accountId);
        // Fase B: notify Portal that this client is no longer paid.
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId =
          typeof invoice.parent?.subscription_details?.subscription === "string"
            ? invoice.parent.subscription_details.subscription
            : null;
        if (!subscriptionId) break;

        // No metadata on an Invoice object — resolve by the subscription
        // id we stored at checkout.session.completed instead.
        await supabaseAdmin()
          .from("accounts")
          .update({ subscription_status: "past_due" satisfies SubscriptionStatus })
          .eq("stripe_subscription_id", subscriptionId);
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error(`[stripe webhook] handler error for ${event.type}:`, err);
    // Return 200 anyway once signature is verified — Stripe retries on
    // non-2xx, and a transient DB hiccup shouldn't cause Stripe to
    // hammer this endpoint. The event is logged above for manual replay.
  }

  return NextResponse.json({ received: true });
}

function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return "past_due";
  }
}
