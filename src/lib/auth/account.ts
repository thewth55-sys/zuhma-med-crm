// ============================================================
// Server-side account context — for API routes and server
// components. Reads the caller's profile + account in one round
// trip and verifies role on demand.
//
// IMPORTANT: this module is server-only. It imports the Supabase
// SSR client (`@/lib/supabase/server`), which reads `next/headers`
// cookies. Importing it from a client component will fail at
// build time with the standard Next.js "You're importing a
// component that needs `next/headers`" error — that's the
// boundary check; we don't need the `server-only` package.
//
// Calling convention
// ------------------
// API routes don't need to redo `supabase.auth.getUser()` — they
// receive a fully-loaded context from `requireRole`:
//
//   try {
//     const ctx = await requireRole("admin");
//     // ctx.supabase — the SSR client (RLS scoped to this user)
//     // ctx.userId  — auth.uid()
//     // ctx.accountId / ctx.role / ctx.account
//   } catch (err) {
//     return errorResponse(err); // see toErrorResponse() below
//   }
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { hasMinRole, isAccountRole, type AccountRole } from "./roles";

// ------------------------------------------------------------
// Errors
//
// Custom classes so API routes can map a single `catch` to the
// right HTTP status without sprinkling 401/403 strings everywhere.
// ------------------------------------------------------------

export class UnauthorizedError extends Error {
  readonly status = 401 as const;
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  readonly status = 403 as const;
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class SubscriptionRequiredError extends Error {
  readonly status = 402 as const;
  constructor(message = "This account's trial or subscription has ended") {
    super(message);
    this.name = "SubscriptionRequiredError";
  }
}

/**
 * Convert one of the typed errors above (or anything else) into a
 * `NextResponse`. Routes can do:
 *
 *   } catch (err) {
 *     return toErrorResponse(err);
 *   }
 *
 * Unknown errors collapse to 500 with the generic message — we
 * never leak `err.message` for non-classified errors to keep
 * server internals out of the wire.
 */
export function toErrorResponse(err: unknown): NextResponse {
  if (
    err instanceof UnauthorizedError ||
    err instanceof ForbiddenError ||
    err instanceof SubscriptionRequiredError
  ) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error("[toErrorResponse] uncategorized error:", err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

// ------------------------------------------------------------
// Account context
// ------------------------------------------------------------

export interface AccountContext {
  /** Supabase SSR client, RLS scoped to the calling user. */
  supabase: SupabaseClient;
  /** `auth.uid()` for the caller. Always defined when this resolves. */
  userId: string;
  /** Caller's account_id from their profile row. */
  accountId: string;
  /** Caller's role within their account. */
  role: AccountRole;
  /** Lightweight account meta — id + name + subscription state. */
  account: {
    id: string;
    name: string;
    plan: string;
    subscriptionStatus: string;
    trialEndsAt: string;
    includedSeats: number;
    logoUrl: string | null;
    quoteTerms: string | null;
    quoteAccentColor: string | null;
    address: string | null;
    taxId: string | null;
  };
}

/**
 * Resolve the caller's user + account + role in one round trip.
 *
 * Throws `UnauthorizedError` if there's no Supabase session.
 * Throws `ForbiddenError` if the profile is missing account
 * fields (shouldn't happen post-017 migration; defensive guard
 * against profile rows that pre-date the backfill or were
 * inserted by hand).
 *
 * Use `requireRole(min)` instead when the route also needs a
 * minimum-role check — it's a thin wrapper over this.
 *
 * `options.allowSuspended` — set only by the two routes a suspended
 * account still needs to reach to pay its way out (Checkout, Customer
 * Portal). Everything else stays hard-blocked; see the check below.
 */
export async function getCurrentAccount(options?: { allowSuspended?: boolean }): Promise<AccountContext> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    throw new UnauthorizedError();
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("account_id, account_role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[getCurrentAccount] profile fetch error:", error);
    throw new ForbiddenError("Could not load account context");
  }
  if (!data || !data.account_id || !data.account_role) {
    // Pre-migration profile, or a manual insert that skipped the
    // signup trigger. The user is authenticated but the app has
    // no way to scope their queries — treat as forbidden.
    throw new ForbiddenError("Profile is not linked to an account");
  }
  if (!isAccountRole(data.account_role)) {
    // The DB enum should make this impossible, but a future
    // migration that broadens the enum without updating TS would
    // hit this — surface it rather than silently widening.
    throw new ForbiddenError(`Unknown account role: ${data.account_role}`);
  }

  // Load the account with a plain point lookup by id rather than an
  // embedded FK join (`account:accounts!inner(...)`). The embed forces
  // PostgREST to resolve the profiles.account_id → accounts.id
  // relationship from its schema cache; when that cache is stale — a
  // common Supabase state right after a migration adds the FK, or when
  // migrations are applied out of band — the embed fails hard with
  // PGRST200 ("could not find a relationship … in the schema cache")
  // and takes down the entire account context (issue #294). A lookup by
  // id needs no relationship inference and is gated by the same accounts
  // RLS, so it stays robust against cache staleness and older schemas.
  const { data: account, error: accountErr } = await supabase
    .from("accounts")
    .select(
      "id, name, plan, subscription_status, trial_ends_at, included_seats, logo_url, quote_terms, quote_accent_color, address, tax_id",
    )
    .eq("id", data.account_id)
    .maybeSingle();

  if (accountErr) {
    console.error("[getCurrentAccount] account fetch error:", accountErr);
    throw new ForbiddenError("Could not load account context");
  }
  if (!account) {
    // account_id points at no readable account row — orphaned profile
    // or an RLS gap. Same "can't scope this user" outcome as above.
    throw new ForbiddenError("Profile is not linked to an account");
  }

  // Hard-block EVERY caller (reads included, not just requireRole's
  // mutating routes) once an admin has suspended the account — this
  // is meant to fully cut it off, not soften into the read-only mode
  // a lapsed trial/cancellation gets (see `requireActiveSubscription`,
  // which deliberately does NOT check 'suspended' — this already
  // covers it). Found via a live bug report: a suspended account kept
  // working normally because nothing server-side ever checked
  // `subscription_status` at all — `AccessBanner` was purely a
  // client-side visual nudge with no enforcement behind it.
  //
  // `allowSuspended` is the one deliberate exception: the account
  // owner needs to reach Checkout/Portal to pay their way out, or a
  // suspension can never self-resolve.
  if (!options?.allowSuspended && account.subscription_status === "suspended") {
    throw new ForbiddenError("This account has been suspended");
  }

  return {
    supabase,
    userId: user.id,
    accountId: data.account_id,
    role: data.account_role,
    account: {
      id: account.id,
      name: account.name,
      plan: account.plan,
      subscriptionStatus: account.subscription_status,
      trialEndsAt: account.trial_ends_at,
      includedSeats: account.included_seats,
      logoUrl: account.logo_url,
      quoteTerms: account.quote_terms,
      quoteAccentColor: account.quote_accent_color,
      address: account.address,
      taxId: account.tax_id,
    },
  };
}

/**
 * Resolve the caller's account context and enforce a minimum role.
 *
 * Throws `UnauthorizedError` / `ForbiddenError` as documented on
 * `getCurrentAccount` (including the 'suspended' hard-block — every
 * caller gets it, whether through this or `getCurrentAccount`
 * directly), plus `ForbiddenError("Insufficient role")` when the
 * caller is below `min`. Pass `{ allowSuspended: true }` through to
 * `getCurrentAccount` for the Checkout/Portal exception — see there.
 */
export async function requireRole(
  min: AccountRole,
  options?: { allowSuspended?: boolean },
): Promise<AccountContext> {
  const ctx = await getCurrentAccount(options);
  if (!hasMinRole(ctx.role, min)) {
    throw new ForbiddenError(
      `This action requires the '${min}' role or higher`,
    );
  }
  return ctx;
}

/**
 * Throws `SubscriptionRequiredError` (402) if `ctx.account`'s trial
 * has expired or its subscription is fully canceled. Deliberately
 * does NOT check 'suspended' — `getCurrentAccount` already hard-blocks
 * that case unconditionally, before this would ever run. Not applied
 * globally (see plan doc — Fase A ships this as an available
 * primitive plus UI-level gating; retrofitting every existing write
 * route is separate follow-up work). Call this explicitly in routes
 * that should hard-block writes once access lapses:
 *
 *   const ctx = await requireRole("agent");
 *   requireActiveSubscription(ctx);
 */
export function requireActiveSubscription(ctx: AccountContext): void {
  const status = ctx.account.subscriptionStatus;
  if (status === "trial_expired" || status === "canceled") {
    throw new SubscriptionRequiredError();
  }
}
