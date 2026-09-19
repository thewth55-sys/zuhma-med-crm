import { NextResponse } from "next/server";

import { requireStaffRole, resolveAccountOwner, logPlatformAdminAction } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/supabase/admin-client";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

const CONTENT_TYPES = ["reel", "carrusel", "historia"] as const;
type ContentType = (typeof CONTENT_TYPES)[number];

interface MarketingContentPostBody {
  title?: string;
  description?: string | null;
  content_type?: ContentType;
  drive_url?: string;
  scheduled_publish_at?: string | null;
  compliance_checklist?: string[] | null;
}

function isDriveUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname === "drive.google.com";
  } catch {
    return false;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    const admin = await requireStaffRole(["marketing"]);
    const { accountId } = await params;

    const limit = checkRateLimit(
      `platformAdmin:marketingContent:${admin.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const owner = await resolveAccountOwner(accountId);
    if (!owner) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) as MarketingContentPostBody | null;
    if (
      !body ||
      !body.title?.trim() ||
      !body.drive_url?.trim() ||
      !body.content_type ||
      !CONTENT_TYPES.includes(body.content_type)
    ) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    if (!isDriveUrl(body.drive_url)) {
      return NextResponse.json({ error: "drive_url must be a drive.google.com link" }, { status: 400 });
    }

    const { data: saved, error } = await supabaseAdmin()
      .from("marketing_content_pieces")
      .insert({
        account_id: accountId,
        title: body.title.trim(),
        description: body.description ?? null,
        content_type: body.content_type,
        drive_url: body.drive_url.trim(),
        scheduled_publish_at: body.scheduled_publish_at ?? null,
        compliance_checklist: body.compliance_checklist ?? null,
      })
      .select("id, title, status")
      .single();

    if (error) {
      console.error("[POST .../marketing-content] insert error:", error);
      return NextResponse.json({ error: "Failed to create marketing content piece" }, { status: 500 });
    }

    await logPlatformAdminAction({
      adminUserId: admin.userId,
      adminEmail: admin.email,
      action: "create_marketing_content_piece",
      targetAccountId: owner.accountId,
      targetUserId: owner.ownerUserId,
      metadata: { accountName: owner.accountName, title: body.title.trim(), contentType: body.content_type },
    });

    return NextResponse.json({ piece: saved });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    await requireStaffRole(["marketing"]);
    const { accountId } = await params;

    const owner = await resolveAccountOwner(accountId);
    if (!owner) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const { data, error } = await supabaseAdmin()
      .from("marketing_content_pieces")
      .select("*")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GET .../marketing-content] query error:", error);
      return NextResponse.json({ error: "Failed to fetch marketing content pieces" }, { status: 500 });
    }

    return NextResponse.json({ pieces: data ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}