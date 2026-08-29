// ============================================================
// GET /api/platform-admin/dashboard — health summary for the /admin
// Dashboard tab: total accounts, new accounts trend, suspended
// accounts, and total seats in use across the platform.
//
// Zuhma Med CRM has no billing of its own accounts (it's offered as a
// free value-add), so there is no MRR/plan/trial-conversion data to
// show here — this used to be a sales dashboard for a paid SaaS
// product; it's now just an operational overview.
// ============================================================

import { NextResponse } from "next/server";

import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/supabase/admin-client";

export async function GET() {
  try {
    await requirePlatformAdmin();
    const db = supabaseAdmin();

    const { data: accounts, error } = await db
      .from("accounts")
      .select("id, name, subscription_status, created_at");

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
    const totalSeats = seatCounts?.length ?? 0;

    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    let newAccountsLast30d = 0;
    let suspendedCount = 0;

    for (const account of rows) {
      if (account.subscription_status === "suspended") suspendedCount += 1;
      if (new Date(account.created_at).getTime() >= thirtyDaysAgo) {
        newAccountsLast30d += 1;
      }
    }

    return NextResponse.json({
      totalAccounts: rows.length,
      newAccountsLast30d,
      suspendedCount,
      totalSeats,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
