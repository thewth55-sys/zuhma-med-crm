// ============================================================
// GET /api/platform-admin/audit-log
//
// Recent platform-admin actions (today: only 'impersonate') for the
// /admin/audit-log page. Service-role read — the audit table has no
// SELECT policy for anything but `is_platform_admin()`, but we're
// already past that gate via requirePlatformAdmin(), and a plain
// RLS-scoped read would work too; service role keeps this route
// consistent with the rest of the platform-admin surface.
// ============================================================

import { NextResponse } from "next/server";

import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/supabase/admin-client";

const PAGE_SIZE = 100;

export async function GET() {
  try {
    await requirePlatformAdmin();

    const admin = supabaseAdmin();

    const { data: logRows, error: logErr } = await admin
      .from("platform_admin_audit_log")
      .select("id, admin_email, action, target_account_id, target_user_id, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (logErr) {
      console.error("[GET /api/platform-admin/audit-log] fetch error:", logErr);
      return NextResponse.json({ error: "Failed to load audit log" }, { status: 500 });
    }

    const accountIds = Array.from(
      new Set((logRows ?? []).map((r) => r.target_account_id).filter((id): id is string => !!id)),
    );

    let accountNames = new Map<string, string>();
    if (accountIds.length > 0) {
      const { data: accounts } = await admin
        .from("accounts")
        .select("id, name")
        .in("id", accountIds);
      accountNames = new Map((accounts ?? []).map((a) => [a.id, a.name]));
    }

    const entries = (logRows ?? []).map((row) => ({
      id: row.id,
      adminEmail: row.admin_email,
      action: row.action,
      targetAccountId: row.target_account_id,
      targetAccountName: row.target_account_id
        ? (accountNames.get(row.target_account_id) ?? null)
        : null,
      targetUserId: row.target_user_id,
      metadata: row.metadata,
      createdAt: row.created_at,
    }));

    return NextResponse.json({ entries });
  } catch (err) {
    return toErrorResponse(err);
  }
}
