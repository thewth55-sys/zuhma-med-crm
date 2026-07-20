import { NextResponse } from "next/server";

import { requirePlatformAdmin, resolveAccountOwner, logPlatformAdminAction } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/supabase/admin-client";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * POST /api/platform-admin/accounts/[accountId]/suspend
 * body: { suspended: boolean }
 *
 * Sets subscription_status to 'suspended' (or back to 'active' when
 * un-suspending) — an administrative lock distinct from a customer's
 * own cancellation (see 044_platform_admin_actions.sql). Deliberately
 * does NOT ban the underlying auth.users rows: a shared account can
 * have several members, and locking every one of them out of even
 * logging in (to see WHY they're suspended) is worse UX than gating
 * access the same way a lapsed trial already does. `hasActiveAccess()`
 * excludes 'suspended' by construction, so this alone flips the whole
 * account to read-only.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    const admin = await requirePlatformAdmin();
    const { accountId } = await params;

    const limit = checkRateLimit(`platformAdmin:suspend:${admin.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as { suspended?: unknown } | null;
    if (typeof body?.suspended !== "boolean") {
      return NextResponse.json({ error: "'suspended' must be a boolean" }, { status: 400 });
    }

    const owner = await resolveAccountOwner(accountId);
    if (!owner) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const supabase = supabaseAdmin();
    const { data: current } = await supabase
      .from("accounts")
      .select("subscription_status")
      .eq("id", accountId)
      .single();

    const nextStatus = body.suspended ? "suspended" : "active";
    const { error: updateErr } = await supabase
      .from("accounts")
      .update({ subscription_status: nextStatus })
      .eq("id", accountId);

    if (updateErr) {
      console.error("[POST .../suspend] update error:", updateErr);
      return NextResponse.json({ error: "Failed to update account" }, { status: 500 });
    }

    await logPlatformAdminAction({
      adminUserId: admin.userId,
      adminEmail: admin.email,
      action: body.suspended ? "suspend" : "reactivate",
      targetAccountId: owner.accountId,
      targetUserId: owner.ownerUserId,
      metadata: {
        accountName: owner.accountName,
        previousStatus: current?.subscription_status ?? null,
        newStatus: nextStatus,
      },
    });

    return NextResponse.json({ ok: true, subscriptionStatus: nextStatus });
  } catch (err) {
    return toErrorResponse(err);
  }
}
