import { NextResponse } from "next/server";

import { requireStaffRole, resolveAccountOwner, logPlatformAdminAction } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/supabase/admin-client";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

interface MarketingContentPatchBody {
  title?: string;
  description?: string;
  content_type?: string;
  drive_url?: string;
  scheduled_publish_at?: string | null;
  compliance_checklist?: string[];
  status?: 'pending' | 'published';
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ accountId: string, pieceId: string }> },
) {
  try {
    const admin = await requireStaffRole(["marketing"]);
    const { accountId, pieceId } = await params;

    const limit = checkRateLimit(
      `platformAdmin:marketingContent:${admin.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const owner = await resolveAccountOwner(accountId);
    if (!owner) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) as MarketingContentPatchBody | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const { data: piece, error: pieceError } = await supabaseAdmin()
      .from("marketing_content_pieces")
      .select("*")
      .eq("id", pieceId)
      .eq("account_id", accountId)
      .maybeSingle();

    if (pieceError || !piece) {
      return NextResponse.json({ error: "Marketing content piece not found" }, { status: 404 });
    }

    if (body.status && !(body.status === 'pending' || body.status === 'published')) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const updatePayload: Partial<MarketingContentPatchBody> = {};
    if (body.title !== undefined) updatePayload.title = body.title.trim();
    if (body.description !== undefined) updatePayload.description = body.description.trim();
    if (body.content_type !== undefined) updatePayload.content_type = body.content_type.trim();
    if (body.drive_url !== undefined) updatePayload.drive_url = body.drive_url.trim();
    if (body.scheduled_publish_at !== undefined) updatePayload.scheduled_publish_at = body.scheduled_publish_at;
    if (body.compliance_checklist !== undefined) updatePayload.compliance_checklist = body.compliance_checklist;
    if (body.status !== undefined) updatePayload.status = body.status;

    const { data: updatedPiece, error: updateError } = await supabaseAdmin()
      .from("marketing_content_pieces")
      .update(updatePayload)
      .eq("id", pieceId)
      .eq("account_id", accountId)
      .select("*")
      .single();

    if (updateError) {
      console.error("[PATCH .../marketing-content/[pieceId]] update error:", updateError);
      return NextResponse.json({ error: "Failed to update marketing content piece" }, { status: 500 });
    }

    await logPlatformAdminAction({
      adminUserId: admin.userId,
      adminEmail: admin.email,
      action: "update_marketing_content_piece",
      targetAccountId: owner.accountId,
      targetUserId: owner.ownerUserId,
      metadata: { accountName: owner.accountName, pieceId: pieceId },
    });

    return NextResponse.json({ piece: updatedPiece });
  } catch (err) {
    return toErrorResponse(err);
  }
}