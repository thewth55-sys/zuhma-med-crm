import { NextResponse } from "next/server";

import { requirePlatformAdmin, resolveAccountOwner, logPlatformAdminAction } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/supabase/admin-client";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * GET/PUT /api/platform-admin/accounts/[accountId]/landing —
 * staff-only read/write of any account's `landing_pages` row, always
 * saving with tier='premium' (this route only exists so Zuhma's
 * design team can fulfil the "Landing de especialidad" line item on
 * Starter/Pro — see puck-config.tsx's fullConfig comment). Bypasses
 * the `landing_pages` RLS policies entirely via the service-role
 * client, same posture as every other /api/platform-admin/** route.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    await requirePlatformAdmin();
    const { accountId } = await params;

    const owner = await resolveAccountOwner(accountId);
    if (!owner) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const { data } = await supabaseAdmin()
      .from("landing_pages")
      .select("id, slug, content, published, tier")
      .eq("account_id", accountId)
      .maybeSingle();

    return NextResponse.json({ accountName: owner.accountName, page: data ?? null });
  } catch (err) {
    return toErrorResponse(err);
  }
}

interface LandingPutBody {
  content?: unknown;
  slug?: string;
  published?: boolean;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    const admin = await requirePlatformAdmin();
    const { accountId } = await params;

    const limit = checkRateLimit(`platformAdmin:landing:${admin.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const owner = await resolveAccountOwner(accountId);
    if (!owner) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) as LandingPutBody | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const payload: Record<string, unknown> = { account_id: accountId, tier: "premium" };
    if (body.content !== undefined) payload.content = body.content;
    if (body.slug !== undefined) payload.slug = body.slug || null;
    if (body.published !== undefined) payload.published = body.published;

    const { data: saved, error } = await supabaseAdmin()
      .from("landing_pages")
      .upsert(payload, { onConflict: "account_id" })
      .select("id, slug, published")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "That slug is already taken" }, { status: 409 });
      }
      console.error("[PUT .../landing] upsert error:", error);
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }

    await logPlatformAdminAction({
      adminUserId: admin.userId,
      adminEmail: admin.email,
      action: "edit_landing_page",
      targetAccountId: owner.accountId,
      targetUserId: owner.ownerUserId,
      metadata: { accountName: owner.accountName, slug: saved.slug, published: saved.published },
    });

    return NextResponse.json({ page: saved });
  } catch (err) {
    return toErrorResponse(err);
  }
}
