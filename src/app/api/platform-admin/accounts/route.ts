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

import { requirePlatformAdmin, logPlatformAdminAction } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/supabase/admin-client";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

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

/**
 * POST /api/platform-admin/accounts
 *
 * Zuhma Med CRM has no self-serve signup — every account is
 * onboarded by Zuhma staff from this panel. Creates the owner's auth
 * user via `inviteUserByEmail` (sends them a set-password email);
 * `handle_new_user()` (042_account_brand_name.sql) picks up the
 * `full_name`/`brand_name` metadata from that call and provisions the
 * `accounts` + `profiles` (role: owner) rows automatically, the same
 * trigger that used to fire from public signup. No plan/seat limit is
 * set — every account is unrestricted by design.
 */
export async function POST(request: Request) {
  try {
    const admin = await requirePlatformAdmin();

    const limit = checkRateLimit(`platformAdmin:accounts:create:${admin.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = await request.json().catch(() => null);
    const accountName = typeof body?.accountName === "string" ? body.accountName.trim() : "";
    const ownerEmail = typeof body?.ownerEmail === "string" ? body.ownerEmail.trim().toLowerCase() : "";
    const ownerFullName = typeof body?.ownerFullName === "string" ? body.ownerFullName.trim() : "";

    if (!accountName) {
      return NextResponse.json({ error: "El nombre de la cuenta es requerido" }, { status: 400 });
    }
    if (!ownerEmail || !ownerEmail.includes("@")) {
      return NextResponse.json({ error: "Correo del propietario inválido" }, { status: 400 });
    }

    const db = supabaseAdmin();

    const { data: invited, error: inviteErr } = await db.auth.admin.inviteUserByEmail(ownerEmail, {
      data: {
        full_name: ownerFullName || undefined,
        brand_name: accountName,
      },
    });

    if (inviteErr || !invited?.user) {
      const alreadyExists = inviteErr?.message?.toLowerCase().includes("already been registered");
      return NextResponse.json(
        {
          error: alreadyExists
            ? "Ya existe un usuario con ese correo"
            : (inviteErr?.message ?? "No se pudo invitar al propietario"),
        },
        { status: 400 },
      );
    }

    // handle_new_user() runs synchronously as part of the auth.users
    // INSERT the invite triggers, so the account row already exists
    // by the time we get here — look it up to return its id.
    const { data: account } = await db
      .from("accounts")
      .select("id, name")
      .eq("owner_user_id", invited.user.id)
      .maybeSingle();

    await logPlatformAdminAction({
      adminUserId: admin.userId,
      adminEmail: admin.email,
      action: "create_account",
      targetAccountId: account?.id ?? null,
      targetUserId: invited.user.id,
      metadata: { accountName, ownerEmail },
    });

    return NextResponse.json({ ok: true, accountId: account?.id ?? null, ownerUserId: invited.user.id });
  } catch (err) {
    return toErrorResponse(err);
  }
}
