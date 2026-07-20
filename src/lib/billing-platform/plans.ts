/**
 * Single source of truth for what Zentro Med sells and how much it
 * costs — every price/seat number lives here, not scattered across
 * Checkout/webhook/pricing-page code. Adjusting a price is a one-line
 * change to this file, not a hunt through the codebase.
 *
 * Numbers below match the public /pricing page exactly (all 4 plans
 * use the same base+included-seats+extra-seat shape now — standalone
 * used to be pure per-seat with no base price, but the current
 * pricing image prices it as "$49 for the first user + $25/extra").
 */

export type Plan = "trial" | "standalone" | "zentro_salud_starter" | "zentro_salud_pro";
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "trial_expired"
  /** Administrative lock set by a platform admin (see /admin) —
   *  distinct from a customer-initiated `canceled`. */
  | "suspended";

export const TRIAL_DAYS = 30;
export const DEFAULT_INCLUDED_SEATS = 2;

export interface PlanDefinition {
  id: Plan;
  /** Flat monthly price in USD. 0 for trial (no card). */
  basePriceUsd: number;
  /** USD per seat beyond includedSeats. null when the plan has no seat billing of its own (trial). */
  seatPriceUsd: number | null;
  includedSeats: number;
  /**
   * Max active contacts ("pacientes activos") this plan allows.
   * null = unlimited. Enforced server-side by a DB trigger — see
   * 049_patient_limit_enforcement.sql — not just here; this constant
   * exists so the UI can show remaining-quota copy, not as the
   * enforcement point itself.
   */
  patientLimit: number | null;
  /**
   * Max AI tokens (prompt + completion, across auto-reply and draft)
   * this plan allows per calendar month. null = unlimited. Enforced in
   * application code (lib/ai/quota.ts), not a DB trigger like
   * patientLimit — the check has to run BEFORE the provider call, not
   * after logging usage, since by then the (BYO-key) cost is already
   * incurred. Placeholder numbers — adjust freely, this is a one-line
   * change same as every other plan constant here.
   */
  aiTokenLimitMonthly: number | null;
  /** Stripe Price IDs — undefined until the corresponding env var is set. */
  stripeBasePriceId?: string;
  stripeSeatPriceId?: string;
  /** Whether this plan is ever purchasable via Checkout (trial isn't — it's the signup default). */
  purchasable: boolean;
}

export const PLAN_CONFIG: Record<Plan, PlanDefinition> = {
  trial: {
    id: "trial",
    basePriceUsd: 0,
    seatPriceUsd: null,
    includedSeats: 1,
    // Not capped by patient count — the 30-day window is the real
    // constraint on a free trial, not volume.
    patientLimit: null,
    // A trial account still using AI needs SOME cap on someone else's
    // BYO key spend during evaluation, even though the tokens aren't
    // Zentro's cost — bounds runaway usage from a misconfigured loop.
    aiTokenLimitMonthly: 20_000,
    purchasable: false,
  },
  standalone: {
    id: "standalone",
    basePriceUsd: 49,
    seatPriceUsd: 25,
    includedSeats: 1,
    patientLimit: 1000,
    aiTokenLimitMonthly: 100_000,
    stripeBasePriceId: process.env.STRIPE_PRICE_STANDALONE_BASE,
    stripeSeatPriceId: process.env.STRIPE_PRICE_STANDALONE_SEAT,
    purchasable: true,
  },
  zentro_salud_starter: {
    id: "zentro_salud_starter",
    basePriceUsd: 299,
    seatPriceUsd: 25,
    includedSeats: DEFAULT_INCLUDED_SEATS,
    patientLimit: 5000,
    aiTokenLimitMonthly: 500_000,
    stripeBasePriceId: process.env.STRIPE_PRICE_ZENTRO_SALUD_STARTER,
    stripeSeatPriceId: process.env.STRIPE_PRICE_SEAT_ADDON,
    purchasable: true,
  },
  zentro_salud_pro: {
    id: "zentro_salud_pro",
    basePriceUsd: 499,
    seatPriceUsd: 25,
    includedSeats: DEFAULT_INCLUDED_SEATS,
    patientLimit: null,
    aiTokenLimitMonthly: null,
    stripeBasePriceId: process.env.STRIPE_PRICE_ZENTRO_SALUD_PRO,
    stripeSeatPriceId: process.env.STRIPE_PRICE_SEAT_ADDON,
    purchasable: true,
  },
};

/**
 * Binary gate: does this account currently have the right to use the
 * product at all, or has its trial lapsed / subscription lapsed with
 * nothing active. Independent of `features.ts`'s per-feature tier
 * gating (automations, AI auto-reply, patient limits) — this only
 * answers "is the account locked out entirely."
 */
export function hasActiveAccess(status: SubscriptionStatus): boolean {
  return status === "trialing" || status === "active" || status === "past_due";
}

export function seatsIncluded(plan: Plan): number {
  return PLAN_CONFIG[plan].includedSeats;
}

export function seatPriceUsd(plan: Plan): number | null {
  return PLAN_CONFIG[plan].seatPriceUsd;
}
