import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";

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

    const { data: comments, error: commentsError } = await supabase
      .from('marketing_content_comments')
      .select('*')
      .eq('piece_id', id)
      .order('created_at', { ascending: true });

    if (commentsError) {
      return NextResponse.json({ error: "Failed to fetch comments" }, { status: 500 });
    }

    return NextResponse.json({ comments: comments ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase, accountId, userId } = await requireRole("agent");
    const { id } = await params;

    const body = await request.json();
    if (!body.body || body.body.trim() === '') {
      return NextResponse.json({ error: "Comment body cannot be empty" }, { status: 400 });
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

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('user_id', userId)
      .maybeSingle();

    const authorName = profile?.full_name ?? 'Tú';

    const { data: comment, error: commentError } = await supabase
      .from('marketing_content_comments')
      .insert({
        account_id: accountId,
        piece_id: id,
        author_type: 'clinic',
        author_user_id: userId,
        author_name: authorName,
        body: body.body.trim(),
      })
      .select()
      .single();

    if (commentError) {
      return NextResponse.json({ error: "Failed to create comment" }, { status: 500 });
    }

    return NextResponse.json({ comment });
  } catch (err) {
    return toErrorResponse(err);
  }
}