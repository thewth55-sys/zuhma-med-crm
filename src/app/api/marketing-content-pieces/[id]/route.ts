import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase, accountId, userId } = await requireRole("agent");
    const { id } = await params;

    const body = await request.json().catch(() => null);
    if (!body || (body.status === undefined && body.feedback === undefined)) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { data: piece, error: pieceError } = await supabase
      .from('marketing_content_pieces')
      .select('*')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle();

    if (pieceError || !piece) {
      return NextResponse.json({ error: "Marketing content piece not found" }, { status: 404 });
    }

    const updateData: { status?: string; reviewed_by_user_id?: string; reviewed_at?: string; feedback?: string } = {};

    if (body.status !== undefined) {
      if (!['approved', 'rejected'].includes(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      updateData.status = body.status;
      updateData.reviewed_by_user_id = userId;
      updateData.reviewed_at = new Date().toISOString();
    }

    if (body.feedback !== undefined) {
      updateData.feedback = body.feedback;
    }

    const { data: updatedPiece, error: updateError } = await supabase
      .from('marketing_content_pieces')
      .update(updateData)
      .eq('id', id)
      .eq('account_id', accountId)
      .select()
      .single();

    if (updateError) {
      console.error("[marketing-content-pieces PATCH] error:", updateError);
      return NextResponse.json({ error: "Failed to update marketing content piece" }, { status: 500 });
    }

    return NextResponse.json({ piece: updatedPiece });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase, accountId } = await requireRole("viewer");
    const { id } = await params;

    const { data: piece, error: pieceError } = await supabase
      .from('marketing_content_pieces')
      .select('*')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle();

    if (pieceError || !piece) {
      return NextResponse.json({ error: "Marketing content piece not found" }, { status: 404 });
    }

    return NextResponse.json({ piece });
  } catch (err) {
    return toErrorResponse(err);
  }
}