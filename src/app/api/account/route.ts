// ============================================================
// /api/account
//
//   GET   — current caller's account + role. Any member.
//   PATCH — rename the account, and/or update its brand logo /
//           quote terms / quote accent color.       Admin+.
//
// Why both verbs share a route file
//   They speak about the same singular resource (the caller's
//   account) and reuse the same `requireRole` plumbing. Splitting
//   them across files would duplicate the `account_id` lookup
//   without buying anything.
// ============================================================

import { NextResponse } from "next/server";

import {
  requireRole,
  getCurrentAccount,
  toErrorResponse,
} from "@/lib/auth/account";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";

export async function GET() {
  try {
    const ctx = await getCurrentAccount();
    return NextResponse.json({
      account: ctx.account,
      role: ctx.role,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

const MAX_NAME_LEN = 80;
const MAX_QUOTE_TERMS_LEN = 4000;
const MAX_ADDRESS_LEN = 300;
const MAX_TAX_ID_LEN = 50;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export async function PATCH(request: Request) {
  try {
    const ctx = await requireRole("admin");

    // Per-user limit on admin-class mutations. Bounds accidental
    // abuse (script run in a loop) and a compromised admin session
    // spamming renames. Each admin endpoint keys its own bucket so
    // one route doesn't starve another.
    const limit = checkRateLimit(
      `admin:rename:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as
      | {
          name?: unknown;
          logo_url?: unknown;
          quote_terms?: unknown;
          quote_accent_color?: unknown;
          address?: unknown;
          tax_id?: unknown;
        }
      | null;

    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const update: Record<string, string | null> = {};

    if (body.name !== undefined) {
      if (typeof body.name !== "string") {
        return NextResponse.json({ error: "'name' must be a string" }, { status: 400 });
      }
      const name = body.name.trim();
      if (name.length === 0) {
        return NextResponse.json({ error: "Account name cannot be empty" }, { status: 400 });
      }
      if (name.length > MAX_NAME_LEN) {
        return NextResponse.json(
          { error: `Account name must be ${MAX_NAME_LEN} characters or fewer` },
          { status: 400 },
        );
      }
      update.name = name;
    }

    if (body.logo_url !== undefined) {
      if (body.logo_url !== null && typeof body.logo_url !== "string") {
        return NextResponse.json({ error: "'logo_url' must be a string or null" }, { status: 400 });
      }
      // Always server-generated (Storage public URL) rather than
      // user-typed, so this is a sanity check, not real validation.
      if (typeof body.logo_url === "string" && !/^https?:\/\//.test(body.logo_url)) {
        return NextResponse.json({ error: "'logo_url' must be a valid URL" }, { status: 400 });
      }
      update.logo_url = body.logo_url;
    }

    if (body.quote_terms !== undefined) {
      if (body.quote_terms !== null && typeof body.quote_terms !== "string") {
        return NextResponse.json({ error: "'quote_terms' must be a string or null" }, { status: 400 });
      }
      const terms = typeof body.quote_terms === "string" ? body.quote_terms.trim() : null;
      if (terms && terms.length > MAX_QUOTE_TERMS_LEN) {
        return NextResponse.json(
          { error: `'quote_terms' must be ${MAX_QUOTE_TERMS_LEN} characters or fewer` },
          { status: 400 },
        );
      }
      update.quote_terms = terms || null;
    }

    if (body.quote_accent_color !== undefined) {
      if (body.quote_accent_color !== null && typeof body.quote_accent_color !== "string") {
        return NextResponse.json(
          { error: "'quote_accent_color' must be a string or null" },
          { status: 400 },
        );
      }
      if (body.quote_accent_color !== null && !HEX_COLOR_RE.test(body.quote_accent_color)) {
        return NextResponse.json(
          { error: "'quote_accent_color' must be a hex color like #4ADE5A" },
          { status: 400 },
        );
      }
      update.quote_accent_color = body.quote_accent_color;
    }

    if (body.address !== undefined) {
      if (body.address !== null && typeof body.address !== "string") {
        return NextResponse.json({ error: "'address' must be a string or null" }, { status: 400 });
      }
      const address = typeof body.address === "string" ? body.address.trim() : null;
      if (address && address.length > MAX_ADDRESS_LEN) {
        return NextResponse.json(
          { error: `'address' must be ${MAX_ADDRESS_LEN} characters or fewer` },
          { status: 400 },
        );
      }
      update.address = address || null;
    }

    if (body.tax_id !== undefined) {
      if (body.tax_id !== null && typeof body.tax_id !== "string") {
        return NextResponse.json({ error: "'tax_id' must be a string or null" }, { status: 400 });
      }
      const taxId = typeof body.tax_id === "string" ? body.tax_id.trim() : null;
      if (taxId && taxId.length > MAX_TAX_ID_LEN) {
        return NextResponse.json(
          { error: `'tax_id' must be ${MAX_TAX_ID_LEN} characters or fewer` },
          { status: 400 },
        );
      }
      update.tax_id = taxId || null;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    // RLS allows this UPDATE because accounts_update requires
    // `is_account_member(id, 'admin')`, and requireRole already
    // guaranteed the caller is admin+.
    const { data, error } = await ctx.supabase
      .from("accounts")
      .update(update)
      .eq("id", ctx.accountId)
      .select("id, name, logo_url, quote_terms, quote_accent_color, address, tax_id")
      .single();

    if (error) {
      console.error("[PATCH /api/account] update error:", error);
      return NextResponse.json(
        { error: "Failed to update account" },
        { status: 500 },
      );
    }

    return NextResponse.json({ account: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}
