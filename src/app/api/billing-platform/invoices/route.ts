import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { getStripeClient } from "@/lib/billing-platform/stripe";

const PAGE_SIZE = 24;

/**
 * GET /api/billing-platform/invoices — native payment history for the
 * Suscripción panel (approved, pending, and failed), each with a
 * direct link to Stripe's hosted PDF. Owner-only, same as the rest of
 * this surface. Complements (doesn't replace) the Customer Portal
 * button, which is still the place to update the card or cancel.
 */
export async function GET() {
  try {
    const { account } = await requireRole("owner");

    if (!account.stripeCustomerId) {
      return NextResponse.json({ invoices: [] });
    }

    const stripe = getStripeClient();
    const list = await stripe.invoices.list({
      customer: account.stripeCustomerId,
      limit: PAGE_SIZE,
    });

    const invoices = list.data
      // Drafts aren't a real event yet — nothing to show a customer.
      .filter((inv) => inv.status !== "draft")
      .map((inv) => ({
        id: inv.id,
        number: inv.number,
        status: inv.status,
        attempted: inv.attempted,
        amountDue: inv.amount_due,
        amountPaid: inv.amount_paid,
        currency: inv.currency,
        created: inv.created,
        description: inv.lines.data[0]?.description ?? null,
        hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
        invoicePdf: inv.invoice_pdf ?? null,
      }));

    return NextResponse.json({ invoices });
  } catch (err) {
    return toErrorResponse(err);
  }
}
