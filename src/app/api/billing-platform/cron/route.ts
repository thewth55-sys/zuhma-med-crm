import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/billing-platform/admin-client";
import { timingSafeSecretEqual } from "@/lib/cron/verify-secret";

/**
 * Marks trial accounts as expired once `trial_ends_at` has passed
 * with no active paid subscription. Meant to run daily (Vercel Cron /
 * external pinger) — same shared-secret pattern as
 * `automations/cron`, via `BILLING_CRON_SECRET`.
 *
 * Only touches `plan = 'trial'` rows still in `subscription_status =
 * 'trialing'` — an account that already checked out during its trial
 * has `subscription_status = 'active'` and is never touched here,
 * even past the original `trial_ends_at` date.
 */
export async function GET(request: Request) {
  const expected = process.env.BILLING_CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  }
  const supplied = request.headers.get("x-cron-secret");
  if (!timingSafeSecretEqual(supplied, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("accounts")
    .update({ subscription_status: "trial_expired" })
    .eq("plan", "trial")
    .eq("subscription_status", "trialing")
    .lt("trial_ends_at", new Date().toISOString())
    .select("id");

  if (error) {
    console.error("[billing-platform cron] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ expired: data?.length ?? 0 });
}
