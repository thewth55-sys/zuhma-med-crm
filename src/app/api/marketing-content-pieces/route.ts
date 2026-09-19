import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";

/**
 * GET /api/marketing-content-pieces — list the current account's
 * marketing content pieces (optionally filtered by ?status=). Pieces
 * are created only by platform admins (see
 * /api/platform-admin/accounts/[accountId]/marketing-content) — this
 * route is read + review only.
 */
export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await requireRole("viewer");
    const url = new URL(request.url);
    const status = url.searchParams.get("status");

    let query = supabase
      .from("marketing_content_pieces")
      .select("*")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) {
      console.error("[marketing-content-pieces GET] error:", error);
      return NextResponse.json({ error: "Failed to load marketing content pieces" }, { status: 500 });
    }
    return NextResponse.json({ pieces: data ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}
