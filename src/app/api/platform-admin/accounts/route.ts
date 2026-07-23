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
import {
  generateActivationCode,
  hashActivationCode,
  activationCodeExpiryFromNow,
} from "@/lib/auth/activation-code";
import { sendActivationCodeEmail } from "@/lib/email/activation-email";

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
 * user via `admin.createUser` (NO email sent — GoTrue's invite link
 * gets consumed by mail scanners → otp_expired). `handle_new_user()`
 * (042_account_brand_name.sql) picks up the `full_name`/`brand_name`
 * metadata and provisions the `accounts` + `profiles` (role: owner)
 * rows automatically. Instead of a link, the owner gets an emailed
 * activation CODE and completes signup (password + T&C) at /activar.
 * No plan/seat limit is set — every account is unrestricted by design.
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

    // Create the owner WITHOUT sending any email. handle_new_user()
    // fires on this INSERT exactly as it did for the invite, so the
    // accounts + profiles rows are provisioned from the metadata.
    const { data: created, error: createErr } = await db.auth.admin.createUser({
      email: ownerEmail,
      email_confirm: false,
      user_metadata: {
        full_name: ownerFullName || undefined,
        brand_name: accountName,
      },
    });

    if (createErr || !created?.user) {
      const msg = createErr?.message?.toLowerCase() ?? "";
      const alreadyExists = msg.includes("already been registered") || msg.includes("already exists");
      return NextResponse.json(
        {
          error: alreadyExists
            ? "Ya existe un usuario con ese correo"
            : (createErr?.message ?? "No se pudo crear al propietario"),
        },
        { status: 400 },
      );
    }

    // handle_new_user() runs synchronously as part of the auth.users
    // INSERT, so the account row already exists — look it up to attach
    // the activation code and return its id.
    const { data: account } = await db
      .from("accounts")
      .select("id, name")
      .eq("owner_user_id", created.user.id)
      .maybeSingle();

    // Generate + store (hashed) the activation code the owner will type
    // at /activar, then email it. The plaintext code only lives in the
    // email; only its hash is persisted.
    const code = generateActivationCode();
    if (account?.id) {
      await db
        .from("accounts")
        .update({
          activation_code_hash: hashActivationCode(code),
          activation_code_expires_at: activationCodeExpiryFromNow(),
          activation_code_used_at: null,
        })
        .eq("id", account.id);
    }

    await logPlatformAdminAction({
      adminUserId: admin.userId,
      adminEmail: admin.email,
      action: "create_account",
      targetAccountId: account?.id ?? null,
      targetUserId: created.user.id,
      metadata: { accountName, ownerEmail },
    });

    // Email the code. The account already exists and the code is
    // stored, so if the send fails the admin can just resend from the
    // accounts table — surface the error so they know to retry.
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || "https://medcrm.zuhma.online";
    let emailError: string | null = null;
    try {
      await sendActivationCodeEmail({ to: ownerEmail, code, baseUrl });
    } catch (sendErr) {
      emailError = sendErr instanceof Error ? sendErr.message : "Error enviando el correo";
      console.error("[POST /accounts] activation email failed:", emailError);
    }

    return NextResponse.json({
      ok: true,
      accountId: account?.id ?? null,
      ownerUserId: created.user.id,
      ...(emailError ? { emailError } : {}),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
