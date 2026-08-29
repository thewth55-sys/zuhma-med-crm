// ============================================================
// GET /api/platform-admin/users — lista plana de usuarios (perfiles) para
// el selector de destinatarios de avisos. Solo platform admins.
// ============================================================

import { NextResponse } from "next/server";

import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/supabase/admin-client";

export async function GET() {
  try {
    await requirePlatformAdmin();
    const db = supabaseAdmin();

    const [{ data: profiles }, { data: accounts }] = await Promise.all([
      db.from("profiles").select("user_id, full_name, email, account_id").order("full_name"),
      db.from("accounts").select("id, name"),
    ]);

    const accountName = new Map((accounts ?? []).map((a) => [a.id, a.name as string]));

    return NextResponse.json({
      users: (profiles ?? []).map((p) => ({
        userId: p.user_id,
        name: p.full_name ?? p.email ?? "—",
        email: p.email,
        accountId: p.account_id,
        accountName: p.account_id ? (accountName.get(p.account_id) ?? null) : null,
      })),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
