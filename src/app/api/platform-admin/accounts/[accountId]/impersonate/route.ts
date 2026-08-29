// ============================================================
// POST /api/platform-admin/accounts/[accountId]/impersonate
//
// Issues a one-time magic-link OTP for the target account's owner
// and logs the action to `platform_admin_audit_log`. Returns a
// `tokenHash` — NOT the full Supabase `action_link` — because the
// admin API's action_link redirects through Supabase's own domain
// and delivers the session as a URL hash fragment, which is fragile
// to depend on. The caller instead calls
// `supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })`
// directly from the browser client, which establishes the session
// (and writes the @supabase/ssr cookies) with no extra hop.
//
// This REPLACES the admin's own session in the same browser — there
// is no dual-session "return to admin" mechanism. The admin signs
// back in as themselves when done. That trade-off is deliberate for
// this first pass: it's simple and honestly represents what's
// happening (audited, logged-in-as-them access), not a permanent
// design constraint.
// ============================================================

import { NextResponse } from "next/server";

import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/supabase/admin-client";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    const admin = await requirePlatformAdmin();
    const { accountId } = await params;

    const limit = checkRateLimit(
      `platformAdmin:impersonate:${admin.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const supabase = supabaseAdmin();

    const { data: account, error: accountErr } = await supabase
      .from("accounts")
      .select("id, name, owner_user_id")
      .eq("id", accountId)
      .maybeSingle();

    if (accountErr) {
      console.error("[POST .../impersonate] account fetch error:", accountErr);
      return NextResponse.json({ error: "Failed to load account" }, { status: 500 });
    }
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Se puede impersonar CUALQUIER miembro (subcuenta) de la cuenta, no
    // solo el dueño. Si viene user_id, se valida que pertenezca a la
    // cuenta; si no, se usa el dueño (comportamiento por defecto).
    const body = (await request.json().catch(() => null)) as { user_id?: unknown } | null;
    const requestedUserId = typeof body?.user_id === "string" ? body.user_id : "";
    const targetUserId = requestedUserId || account.owner_user_id;

    const { data: targetProfile, error: profileErr } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("user_id", targetUserId)
      .eq("account_id", account.id)
      .maybeSingle();

    if (profileErr || !targetProfile?.email) {
      console.error("[POST .../impersonate] target profile fetch error:", profileErr);
      return NextResponse.json(
        { error: "El usuario no pertenece a esta cuenta o no tiene correo" },
        { status: 400 },
      );
    }

    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: targetProfile.email,
    });

    if (linkErr || !linkData) {
      console.error("[POST .../impersonate] generateLink error:", linkErr);
      return NextResponse.json(
        { error: "Failed to issue an impersonation link" },
        { status: 500 },
      );
    }

    const { error: auditErr } = await supabase.from("platform_admin_audit_log").insert({
      admin_user_id: admin.userId,
      admin_email: admin.email,
      action: "impersonate",
      target_account_id: account.id,
      target_user_id: targetUserId,
      metadata: { accountName: account.name, targetEmail: targetProfile.email },
    });

    if (auditErr) {
      // Fail closed — an unlogged impersonation is worse than a
      // blocked one. The admin can retry.
      console.error("[POST .../impersonate] audit log insert failed:", auditErr);
      return NextResponse.json(
        { error: "Failed to record the audit log entry; impersonation aborted" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      tokenHash: linkData.properties.hashed_token,
      ownerEmail: targetProfile.email,
      ownerName: targetProfile.full_name,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
