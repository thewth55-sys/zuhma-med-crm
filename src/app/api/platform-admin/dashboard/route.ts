// ============================================================
// GET /api/platform-admin/dashboard — sales/health summary for the
// /admin Dashboard tab: MRR by plan, account counts by status, new
// accounts trend, and at-risk accounts (past_due or trial expiring
// soon).
//
// MRR is computed from PLAN_CONFIG list pricing (base + extra seats
// beyond includedSeats), not live Stripe subscriptions — accurate for
// list-price billing, but won't reflect a manually-applied Stripe
// coupon/discount on a specific customer. Good enough for a
// dashboard glance; the per-account Stripe invoice history in Cuenta
// 360 is still the source of truth for what actually got charged.
// ============================================================

import { NextResponse } from "next/server";

import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/billing-platform/admin-client";
import { PLAN_CONFIG, type Plan, type SubscriptionStatus } from "@/lib/billing-platform/plans";

const MRR_ELIGIBLE_STATUSES: SubscriptionStatus[] = ["active", "past_due"];
const AT_RISK_TRIAL_DAYS = 3;

export async function GET() {
  try {
    await requirePlatformAdmin();
    const db = supabaseAdmin();

    const { data: accounts, error } = await db
      .from("accounts")
      .select("id, name, plan, subscription_status, included_seats, trial_ends_at, created_at");

    if (error) {
      console.error("[GET /api/platform-admin/dashboard] fetch error:", error);
      return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 });
    }

    const rows = accounts ?? [];

    const { data: seatCounts } = await db.from("profiles").select("account_id");
    const seatsByAccount = new Map<string, number>();
    for (const row of seatCounts ?? []) {
      if (!row.account_id) continue;
      seatsByAccount.set(row.account_id, (seatsByAccount.get(row.account_id) ?? 0) + 1);
    }

    let mrrTotal = 0;
    const mrrByPlan: Record<Plan, number> = {
      trial: 0,
      standalone: 0,
      zentro_salud_starter: 0,
      zentro_salud_pro: 0,
    };
    const statusCounts: Record<SubscriptionStatus, number> = {
      trialing: 0,
      active: 0,
      past_due: 0,
      canceled: 0,
      trial_expired: 0,
      suspended: 0,
    };
    const planCounts: Record<Plan, number> = {
      trial: 0,
      standalone: 0,
      zentro_salud_starter: 0,
      zentro_salud_pro: 0,
    };

    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    let newAccountsLast30d = 0;

    const atRisk: {
      id: string;
      name: string;
      reason: "past_due" | "trial_ending";
      detail: string;
    }[] = [];

    for (const account of rows) {
      const plan = account.plan as Plan;
      const status = account.subscription_status as SubscriptionStatus;

      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
      planCounts[plan] = (planCounts[plan] ?? 0) + 1;

      if (new Date(account.created_at).getTime() >= thirtyDaysAgo) {
        newAccountsLast30d += 1;
      }

      if (MRR_ELIGIBLE_STATUSES.includes(status) && plan !== "trial") {
        const config = PLAN_CONFIG[plan];
        const seats = seatsByAccount.get(account.id) ?? 0;
        const extraSeats = Math.max(0, seats - config.includedSeats);
        const accountMrr = config.basePriceUsd + extraSeats * (config.seatPriceUsd ?? 0);
        mrrTotal += accountMrr;
        mrrByPlan[plan] += accountMrr;
      }

      if (status === "past_due") {
        atRisk.push({ id: account.id, name: account.name, reason: "past_due", detail: "Pago vencido" });
      } else if (status === "trialing" && account.trial_ends_at) {
        const daysLeft = Math.ceil((new Date(account.trial_ends_at).getTime() - now) / (24 * 60 * 60 * 1000));
        if (daysLeft <= AT_RISK_TRIAL_DAYS && daysLeft >= 0) {
          atRisk.push({
            id: account.id,
            name: account.name,
            reason: "trial_ending",
            detail: daysLeft === 0 ? "Prueba vence hoy" : `Prueba vence en ${daysLeft} día${daysLeft === 1 ? "" : "s"}`,
          });
        }
      }
    }

    const trialCount = statusCounts.trialing;
    const paidCount = statusCounts.active + statusCounts.past_due;
    // Rough lifetime conversion signal, not cohort-based: of every
    // account that ever left the trial state (paid, past_due,
    // canceled, or trial_expired), what fraction converted to paying.
    const everLeftTrial = paidCount + statusCounts.canceled + statusCounts.trial_expired;
    const conversionRate = everLeftTrial > 0 ? paidCount / everLeftTrial : null;

    return NextResponse.json({
      mrrTotal,
      mrrByPlan,
      planCounts,
      statusCounts,
      newAccountsLast30d,
      trialCount,
      conversionRate,
      atRisk: atRisk.sort((a, b) => Number(b.reason === "past_due") - Number(a.reason === "past_due")),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
