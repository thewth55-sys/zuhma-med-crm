// ============================================================
// /api/settings/business-hours
//
//   GET — the account's timezone + weekly business hours. Any member.
//   PUT — replace the whole weekly schedule + timezone.        Admin+.
//
// Feature C (clinic general schedule). The public booking slot logic
// (src/lib/scheduling/business-hours.ts) reads these rows to constrain
// / provide bookable time. PUT is a full replace of the account's rows
// so the UI can send the entire week in one call.
// ============================================================

import { NextResponse } from "next/server";

import { requireRole, getCurrentAccount, toErrorResponse } from "@/lib/auth/account";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

interface DayInput {
  weekday: number;
  open_time: string;
  close_time: string;
}

export async function GET() {
  try {
    const ctx = await getCurrentAccount();
    const [{ data: account }, { data: hours }] = await Promise.all([
      ctx.supabase.from("accounts").select("timezone").eq("id", ctx.accountId).maybeSingle(),
      ctx.supabase
        .from("business_hours")
        .select("weekday, open_time, close_time")
        .eq("account_id", ctx.accountId)
        .order("weekday"),
    ]);
    return NextResponse.json({
      timezone: (account?.timezone as string) || "America/Mexico_City",
      days: hours ?? [],
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PUT(request: Request) {
  try {
    const ctx = await requireRole("admin");

    const limit = checkRateLimit(`admin:business-hours:${ctx.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as
      | { timezone?: unknown; days?: unknown }
      | null;
    if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

    // Timezone: validate against the runtime's IANA database.
    let timezone = "America/Mexico_City";
    if (body.timezone !== undefined) {
      if (typeof body.timezone !== "string") {
        return NextResponse.json({ error: "'timezone' must be a string" }, { status: 400 });
      }
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: body.timezone });
        timezone = body.timezone;
      } catch {
        return NextResponse.json({ error: "Unknown timezone" }, { status: 400 });
      }
    }

    if (!Array.isArray(body.days)) {
      return NextResponse.json({ error: "'days' must be an array" }, { status: 400 });
    }

    const rows: DayInput[] = [];
    for (const raw of body.days) {
      const d = raw as Partial<DayInput>;
      if (typeof d.weekday !== "number" || d.weekday < 0 || d.weekday > 6) {
        return NextResponse.json({ error: "Each day needs a weekday 0-6" }, { status: 400 });
      }
      if (typeof d.open_time !== "string" || !TIME_RE.test(d.open_time)) {
        return NextResponse.json({ error: "Invalid open_time (HH:MM)" }, { status: 400 });
      }
      if (typeof d.close_time !== "string" || !TIME_RE.test(d.close_time)) {
        return NextResponse.json({ error: "Invalid close_time (HH:MM)" }, { status: 400 });
      }
      if (d.close_time <= d.open_time) {
        return NextResponse.json(
          { error: "close_time must be after open_time" },
          { status: 400 },
        );
      }
      rows.push({ weekday: d.weekday, open_time: d.open_time, close_time: d.close_time });
    }

    // Persist timezone (RLS: accounts_update requires admin).
    const { error: tzErr } = await ctx.supabase
      .from("accounts")
      .update({ timezone })
      .eq("id", ctx.accountId);
    if (tzErr) {
      console.error("[PUT /api/settings/business-hours] timezone error:", tzErr);
      return NextResponse.json({ error: "Failed to save timezone" }, { status: 500 });
    }

    // Full replace of this account's rows. RLS scopes both statements
    // to the caller's account (business_hours_modify → admin).
    const { error: delErr } = await ctx.supabase
      .from("business_hours")
      .delete()
      .eq("account_id", ctx.accountId);
    if (delErr) {
      console.error("[PUT /api/settings/business-hours] delete error:", delErr);
      return NextResponse.json({ error: "Failed to save hours" }, { status: 500 });
    }

    if (rows.length > 0) {
      const { error: insErr } = await ctx.supabase
        .from("business_hours")
        .insert(rows.map((r) => ({ ...r, account_id: ctx.accountId })));
      if (insErr) {
        console.error("[PUT /api/settings/business-hours] insert error:", insErr);
        return NextResponse.json({ error: "Failed to save hours" }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, timezone, days: rows });
  } catch (err) {
    return toErrorResponse(err);
  }
}
