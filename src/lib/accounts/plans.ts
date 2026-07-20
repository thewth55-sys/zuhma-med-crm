/**
 * Account plan/subscription-status types.
 *
 * Zuhma Med CRM has a single open plan with no tiers, no pricing, and
 * no resource limits tied to plan — it's offered as a free value-add
 * to Zuhma's own clients, not a paid SaaS product. The `plan` column
 * on `accounts` and this `Plan` type are kept only as inert metadata
 * (a few legacy values from the zentro-med fork this codebase started
 * from) since nothing reads them for gating anymore; nothing enforces
 * a limit by plan (see 068_open_plan_unlimited_patients.sql and
 * lib/ai/quota.ts, which is capped only by an explicit per-account
 * admin override, never by plan).
 *
 * `SubscriptionStatus` still matters: 'suspended' is a real
 * administrative lock (see /admin), enforced in
 * `getCurrentAccount` (lib/auth/account.ts).
 */

export type Plan = "trial" | "standalone" | "zentro_salud_starter" | "zentro_salud_pro";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "trial_expired"
  /** Administrative lock set by a platform admin (see /admin) —
   *  distinct from a customer-initiated `canceled`. Enforced
   *  server-side in `getCurrentAccount` (lib/auth/account.ts). */
  | "suspended";
