import { NextResponse } from "next/server";

import { requireStaffRole, resolveAccountOwner } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/supabase/admin-client";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

interface MarketingContentCommentPostBody {
  body: string;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ accountId: string, pieceId: string }> },
) {
  try {
    await requireStaffRole(["marketing"]);
    const { accountId, pieceId } = await params;

    const owner = await resolveAccountOwner(accountId);
    if (!owner) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const { data: piece, error: pieceError } = await supabaseAdmin()
      .from("marketing_content_pieces")
      .select("id")
      .eq("id", pieceId)
      .eq("account_id", accountId)
      .maybeSingle();

    if (pieceError || !piece) {
      return NextResponse.json({ error: "Marketing content piece not found" }, { status: 404 });
    }

    const { data: comments, error } = await supabaseAdmin()
      .from("marketing_content_comments")
      .select("*")
      .eq("piece_id", pieceId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[GET .../marketing-content/[pieceId]/comments] fetch error:", error);
      return NextResponse.json({ error: "Failed to load comments" }, { status: 500 });
    }

    return NextResponse.json({ comments: comments ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ accountId: string, pieceId: string }> },
) {
  try {
    const admin = await requireStaffRole(["marketing"]);
    const { accountId, pieceId } = await params;

    const limit = checkRateLimit(
      `platformAdmin:marketingContentComment:${admin.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const owner = await resolveAccountOwner(accountId);
    if (!owner) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) as MarketingContentCommentPostBody | null;
    if (!body || !body.body.trim()) {
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

    const { data: accountData } = await supabaseAdmin()
      .from('accounts')
      .select('marketing_executive_id')
      .eq('id', accountId)
      .single();

    let authorName = admin.email;
    if (accountData && accountData.marketing_executive_id) {
      const { data: userData } = await supabaseAdmin().auth.admin.getUserById(accountData.marketing_executive_id);
      authorName = userData?.user?.user_metadata?.full_name ?? userData?.user?.email ?? "Equipo de Zentro Labs";
    }

    const { data: comment, error: commentError } = await supabaseAdmin()
      .from("marketing_content_comments")
      .insert({
        account_id: accountId,
        piece_id: pieceId,
        author_type: 'staff',
        author_user_id: admin.userId,
        author_name: authorName,
        body: body.body.trim(),
      })
      .select()
      .single();

    if (commentError) {
      console.error("[POST .../marketing-content/[pieceId]/comments] insert error:", commentError);
      return NextResponse.json({ error: "Failed to create marketing content comment" }, { status: 500 });
    }

    return NextResponse.json({ comment });
  } catch (err) {
    return toErrorResponse(err);
  }
}