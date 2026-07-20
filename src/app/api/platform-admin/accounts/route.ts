// ============================================================
// GET /api/platform-admin/accounts
//
// Lists every account on the platform for the /admin panel — name,
// owner, plan, subscription status, seat usage. Crosses every
// account's RLS boundary on purpose (that's the point of a platform
// admin), so it reads through the service-role client rather than
// the caller's RLS-scoped one. `requirePlatformAdmin()` is the gate
// that makes that safe.
// ============================================================

import { NextResponse } from "next/server";

import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/billing-platform/admin-client";

export async function GET() {
  try {
    await requirePlatformAdmin();

    const admin = supabaseAdmin();

    const { data: accounts, error: accountsErr } = await admin
      .from("accounts")
      .select(
        "id, name, owner_user_id, plan, subscription_status, trial_ends_at, included_seats, portal_client_id, created_at",
      )
      .order("created_at", { ascending: false });

    if (accountsErr) {
      console.error("[GET /api/platform-admin/accounts] accounts fetch error:", accountsErr);
      return NextResponse.json({ error: "Failed to load accounts" }, { status: 500 });
    }

    const { data: profiles, error: profilesErr } = await admin
      .from("profiles")
      .select("account_id, user_id, full_name, email, account_role");

    if (profilesErr) {
      console.error("[GET /api/platform-admin/accounts] profiles fetch error:", profilesErr);
      return NextResponse.json({ error: "Failed to load accounts" }, { status: 500 });
    }

    const profilesByAccount = new Map<string, typeof profiles>();
    for (const profile of profiles ?? []) {
      if (!profile.account_id) continue;
      const list = profilesByAccount.get(profile.account_id) ?? [];
      list.push(profile);
      profilesByAccount.set(profile.account_id, list);
    }

    const result = (accounts ?? []).map((account) => {
      const members = profilesByAccount.get(account.id) ?? [];
      const owner =
        members.find((m) => m.user_id === account.owner_user_id) ??
        members.find((m) => m.account_role === "owner");

      return {
        id: account.id,
        name: account.name,
        ownerUserId: account.owner_user_id,
        ownerName: owner?.full_name ?? null,
        ownerEmail: owner?.email ?? null,
        plan: account.plan,
        subscriptionStatus: account.subscription_status,
        trialEndsAt: account.trial_ends_at,
        includedSeats: account.included_seats,
        seatsUsed: members.length,
        portalClientId: account.portal_client_id,
        createdAt: account.created_at,
      };
    });

    return NextResponse.json({ accounts: result });
  } catch (err) {
    return toErrorResponse(err);
  }
}
