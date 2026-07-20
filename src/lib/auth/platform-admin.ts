// ============================================================
// Platform-admin context — for the /admin super-admin panel.
//
// Deliberately separate from `account.ts` — `requireRole()` answers
// "does this user have enough privilege INSIDE their own account",
// while this answers "is this user Zentro Med staff, with no
// particular account of their own". A user can be a platform admin
// and simultaneously a plain `viewer` (or nothing at all) in every
// clinic's account — the two are unrelated axes.
// ============================================================

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/billing-platform/admin-client";
import { UnauthorizedError, ForbiddenError } from "./account";

export interface PlatformAdminContext {
  userId: string;
  email: string | null;
}

/**
 * Throws `UnauthorizedError` if there's no session, `ForbiddenError`
 * if the caller isn't in `platform_admins`. Use at the top of every
 * `/api/platform-admin/**` route and inside `/admin/**` server
 * components/layouts.
 */
export async function requirePlatformAdmin(): Promise<PlatformAdminContext> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    throw new UnauthorizedError();
  }

  const { data, error } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[requirePlatformAdmin] lookup error:", error);
    throw new ForbiddenError("Could not verify platform admin status");
  }
  if (!data) {
    throw new ForbiddenError("Platform admin access required");
  }

  return { userId: user.id, email: user.email ?? null };
}

export interface AccountOwnerInfo {
  accountId: string;
  accountName: string;
  ownerUserId: string;
  ownerEmail: string;
  ownerName: string | null;
}

/**
 * Shared lookup for every /api/platform-admin/accounts/[accountId]/**
 * action route — resolves the account and its owner's email via the
 * service-role client (crosses RLS on purpose, same as the rest of
 * this surface). Returns null rather than throwing so callers can
 * emit their own 404 with route-appropriate wording.
 */
export async function resolveAccountOwner(accountId: string): Promise<AccountOwnerInfo | null> {
  const admin = supabaseAdmin();

  const { data: account } = await admin
    .from("accounts")
    .select("id, name, owner_user_id")
    .eq("id", accountId)
    .maybeSingle();
  if (!account) return null;

  const { data: profile } = await admin
    .from("profiles")
    .select("email, full_name")
    .eq("user_id", account.owner_user_id)
    .maybeSingle();
  if (!profile?.email) return null;

  return {
    accountId: account.id,
    accountName: account.name,
    ownerUserId: account.owner_user_id,
    ownerEmail: profile.email,
    ownerName: profile.full_name ?? null,
  };
}

/**
 * Shared audit-log write for every platform-admin action — mirrors
 * the impersonate route's inline insert (041_platform_admin_audit_log.sql).
 * `action` is free text by design; new action kinds need no schema
 * change, just a new string here.
 */
export async function logPlatformAdminAction(params: {
  adminUserId: string;
  adminEmail: string | null;
  action: string;
  targetAccountId?: string | null;
  targetUserId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<{ error: { message: string } | null }> {
  const admin = supabaseAdmin();
  const { error } = await admin.from("platform_admin_audit_log").insert({
    admin_user_id: params.adminUserId,
    admin_email: params.adminEmail,
    action: params.action,
    target_account_id: params.targetAccountId ?? null,
    target_user_id: params.targetUserId ?? null,
    metadata: params.metadata ?? null,
  });
  return { error };
}
