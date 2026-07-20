import Stripe from "stripe";

/**
 * Single Stripe client for the platform-subscription layer (Zentro
 * Med billing its own customers) — not to be confused with anything
 * a clinic charges ITS patients, which stays inside the
 * quotes/invoices/payments module and has no Stripe involvement.
 *
 * Lazily constructed so a missing `STRIPE_SECRET_KEY` only breaks the
 * routes that actually need Stripe (typecheck/build stay green
 * without real keys — same posture as every other secret in this
 * codebase).
 */
let cachedClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (cachedClient) return cachedClient;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  cachedClient = new Stripe(secretKey, {
    apiVersion: "2026-06-24.dahlia",
  });
  return cachedClient;
}
