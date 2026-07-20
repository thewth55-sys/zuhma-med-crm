import { NextResponse } from "next/server";

import { requirePlatformAdmin, resolveAccountOwner, logPlatformAdminAction } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/billing-platform/admin-client";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * PATCH /api/platform-admin/accounts/[accountId]/ai-quota
 * body: { blocked?: boolean, tokenLimitOverride?: number | null }
 *
 * Lets a platform admin override an account's AI token quota
 * (lib/ai/quota.ts) independently of its plan:
 *   - `blocked` — hard kill switch, checked before the plan's cap.
 *   - `tokenLimitOverride` — replaces the plan's monthly token cap for
 *     this account only. `null` clears the override (falls back to
 *     the plan default); `0` is a valid value (blocks via the quota
 *     path rather than the `blocked` flag — useful when the intent is
 *     "out of tokens" rather than "access revoked").
 *
 * Both fields are optional and independent — a caller can flip one
 * without touching the other.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    const admin = await requirePlatformAdmin();
    const { accountId } = await params;

    const limit = checkRateLimit(`platformAdmin:aiQuota:${admin.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as
      | { blocked?: unknown; tokenLimitOverride?: unknown }
      | null;

    const update: Record<string, unknown> = {};
    if (body && "blocked" in body) {
      if (typeof body.blocked !== "boolean") {
        return NextResponse.json({ error: "'blocked' must be a boolean" }, { status: 400 });
      }
      update.ai_access_blocked = body.blocked;
    }
    if (body && "tokenLimitOverride" in body) {
      const raw = body.tokenLimitOverride;
      if (raw !== null && (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0)) {
        return NextResponse.json(
          { error: "'tokenLimitOverride' must be null or a non-negative integer" },
          { status: 400 },
        );
      }
      update.ai_token_limit_override = raw;
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const owner = await resolveAccountOwner(accountId);
    if (!owner) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const supabase = supabaseAdmin();
    const { error: updateErr } = await supabase.from("accounts").update(update).eq("id", accountId);
    if (updateErr) {
      console.error("[PATCH .../ai-quota] update error:", updateErr);
      return NextResponse.json({ error: "Failed to update account" }, { status: 500 });
    }

    await logPlatformAdminAction({
      adminUserId: admin.userId,
      adminEmail: admin.email,
      action: "set_ai_quota",
      targetAccountId: owner.accountId,
      targetUserId: owner.ownerUserId,
      metadata: { accountName: owner.accountName, ...update },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
