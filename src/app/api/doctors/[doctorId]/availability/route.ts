// ============================================================
// /api/doctors/[doctorId]/availability
//
//   GET    — upcoming availability blocks for the doctor.   Agent+.
//   POST   — add a block { date, start, end } (clinic-local).Agent+.
//   DELETE — remove a block ?block_id=.                      Agent+.
//
// Feature A (staff manages doctor availability). Agent+ can manage any
// doctor's blocks in their account (see migration 074 RLS). Block times
// are entered in clinic-local wall-clock and converted to UTC using the
// account's timezone, so they line up with the clinic hours (feature C).
// ============================================================

import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { localDateTimeToUtcISO } from "@/lib/scheduling/business-hours";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Confirms the doctor belongs to the caller's account (RLS-scoped read). */
async function doctorInAccount(
  ctx: Awaited<ReturnType<typeof requireRole>>,
  doctorId: string,
): Promise<boolean> {
  const { data } = await ctx.supabase
    .from("doctors")
    .select("id")
    .eq("id", doctorId)
    .eq("account_id", ctx.accountId)
    .maybeSingle();
  return !!data;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ doctorId: string }> },
) {
  try {
    const ctx = await requireRole("agent");
    const { doctorId } = await params;
    if (!(await doctorInAccount(ctx, doctorId))) {
      return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
    }

    const nowIso = new Date().toISOString();
    const { data, error } = await ctx.supabase
      .from("doctor_availability_blocks")
      .select("id, start_at, end_at, notes")
      .eq("account_id", ctx.accountId)
      .eq("doctor_id", doctorId)
      .gte("end_at", nowIso)
      .order("start_at")
      .limit(200);
    if (error) {
      console.error("[GET availability] error:", error);
      return NextResponse.json({ error: "Failed to load availability" }, { status: 500 });
    }
    return NextResponse.json({ blocks: data ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ doctorId: string }> },
) {
  try {
    const ctx = await requireRole("agent");
    const { doctorId } = await params;

    const limit = checkRateLimit(`availability:${ctx.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    if (!(await doctorInAccount(ctx, doctorId))) {
      return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) as
      | { date?: unknown; start?: unknown; end?: unknown }
      | null;
    if (
      !body ||
      typeof body.date !== "string" ||
      !DATE_RE.test(body.date) ||
      typeof body.start !== "string" ||
      !TIME_RE.test(body.start) ||
      typeof body.end !== "string" ||
      !TIME_RE.test(body.end)
    ) {
      return NextResponse.json(
        { error: "date (YYYY-MM-DD), start and end (HH:MM) are required" },
        { status: 400 },
      );
    }
    if (body.end <= body.start) {
      return NextResponse.json({ error: "end must be after start" }, { status: 400 });
    }

    // Account timezone → interpret the wall-clock the user typed.
    const { data: account } = await ctx.supabase
      .from("accounts")
      .select("timezone")
      .eq("id", ctx.accountId)
      .maybeSingle();
    const tz = (account?.timezone as string) || "America/Mexico_City";

    const startIso = localDateTimeToUtcISO(body.date, body.start, tz);
    const endIso = localDateTimeToUtcISO(body.date, body.end, tz);

    const { data, error } = await ctx.supabase
      .from("doctor_availability_blocks")
      .insert({
        account_id: ctx.accountId,
        doctor_id: doctorId,
        start_at: startIso,
        end_at: endIso,
      })
      .select("id, start_at, end_at, notes")
      .single();
    if (error) {
      console.error("[POST availability] error:", error);
      return NextResponse.json({ error: "Failed to add block" }, { status: 500 });
    }
    return NextResponse.json({ block: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ doctorId: string }> },
) {
  try {
    const ctx = await requireRole("agent");
    const { doctorId } = await params;
    const blockId = new URL(request.url).searchParams.get("block_id");
    if (!blockId) {
      return NextResponse.json({ error: "block_id is required" }, { status: 400 });
    }

    const { error } = await ctx.supabase
      .from("doctor_availability_blocks")
      .delete()
      .eq("id", blockId)
      .eq("doctor_id", doctorId)
      .eq("account_id", ctx.accountId);
    if (error) {
      console.error("[DELETE availability] error:", error);
      return NextResponse.json({ error: "Failed to remove block" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
