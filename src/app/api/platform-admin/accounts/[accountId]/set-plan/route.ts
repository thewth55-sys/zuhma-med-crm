import { NextResponse } from "next/server";

import { requirePlatformAdmin, resolveAccountOwner, logPlatformAdminAction } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/billing-platform/admin-client";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import type { Plan, SubscriptionStatus } from "@/lib/billing-platform/plans";

const VALID_PLANS: Plan[] = ["trial", "standalone", "zentro_salud_starter", "zentro_salud_pro"];
const VALID_STATUSES: SubscriptionStatus[] = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "trial_expired",
  "suspended",
];

/**
 * POST /api/platform-admin/accounts/[accountId]/set-plan
 * body: { plan: Plan, subscriptionStatus: SubscriptionStatus }
 *
 * Directly sets plan/status, bypassing Stripe entirely — this is
 * BOTH "cambiar nivel de suscripción" (manual upgrade/downgrade
 * outside a Checkout session) and "dar cortesía" (set a paid plan +
 * `active` with no real stripe_subscription_id attached, so Stripe
 * never bills them but hasActiveAccess() reads them as fully paid) —
 * mechanically the same write, just different intent. Does NOT touch
 * stripe_subscription_id: a comped account has none; a manually-
 * corrected paid account keeps whatever it already had.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    const admin = await requirePlatformAdmin();
    const { accountId } = await params;

    const limit = checkRateLimit(`platformAdmin:setPlan:${admin.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as
      | { plan?: unknown; subscriptionStatus?: unknown }
      | null;

    const plan = body?.plan;
    const subscriptionStatus = body?.subscriptionStatus;

    if (typeof plan !== "string" || !VALID_PLANS.includes(plan as Plan)) {
      return NextResponse.json(
        { error: `'plan' must be one of: ${VALID_PLANS.join(", ")}` },
        { status: 400 },
      );
    }
    if (typeof subscriptionStatus !== "string" || !VALID_STATUSES.includes(subscriptionStatus as SubscriptionStatus)) {
      return NextResponse.json(
        { error: `'subscriptionStatus' must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 },
      );
    }

    const owner = await resolveAccountOwner(accountId);
    if (!owner) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const supabase = supabaseAdmin();
    const { data: current } = await supabase
      .from("accounts")
      .select("plan, subscription_status")
      .eq("id", accountId)
      .single();

    const { error: updateErr } = await supabase
      .from("accounts")
      .update({ plan, subscription_status: subscriptionStatus })
      .eq("id", accountId);

    if (updateErr) {
      console.error("[POST .../set-plan] update error:", updateErr);
      return NextResponse.json({ error: "Failed to update account" }, { status: 500 });
    }

    await logPlatformAdminAction({
      adminUserId: admin.userId,
      adminEmail: admin.email,
      action: "set_plan",
      targetAccountId: owner.accountId,
      targetUserId: owner.ownerUserId,
      metadata: {
        accountName: owner.accountName,
        previousPlan: current?.plan ?? null,
        previousStatus: current?.subscription_status ?? null,
        newPlan: plan,
        newStatus: subscriptionStatus,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
