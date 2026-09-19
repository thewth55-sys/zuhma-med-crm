import { NextResponse } from "next/server";

import { requireStaffRole, resolveAccountOwner, logPlatformAdminAction } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/supabase/admin-client";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

interface MarketingExecutivePatchBody {
  executiveId: string | null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    const admin = await requireStaffRole(["marketing"]);
    const { accountId } = await params;

    const limit = checkRateLimit(
      `platformAdmin:marketingExecutive:${admin.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const owner = await resolveAccountOwner(accountId);
    if (!owner) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) as MarketingExecutivePatchBody | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    if (body.executiveId !== null) {
      const { data, error } = await supabaseAdmin()
        .from('platform_admins')
        .select('user_id')
        .eq('user_id', body.executiveId)
        .maybeSingle();

      if (error || !data) {
        return NextResponse.json({ error: "Invalid executive" }, { status: 400 });
      }
    }

    const { error: updateError } = await supabaseAdmin()
      .from('accounts')
      .update({ marketing_executive_id: body.executiveId })
      .eq('id', accountId);

    if (updateError) {
      console.error("[PATCH .../marketing-executive] update error:", updateError);
      return NextResponse.json({ error: "Failed to update marketing executive" }, { status: 500 });
    }

    await logPlatformAdminAction({
      adminUserId: admin.userId,
      adminEmail: admin.email,
      action: "set_marketing_executive",
      targetAccountId: owner.accountId,
      targetUserId: owner.ownerUserId,
      metadata: { accountName: owner.accountName, executiveId: body.executiveId },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}