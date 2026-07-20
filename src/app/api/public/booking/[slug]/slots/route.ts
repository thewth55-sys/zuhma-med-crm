import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin-client";
import { computeAvailableSlots } from "@/lib/scheduling/public-booking";
import { checkRateLimit, getClientIp, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * GET /api/public/booking/[slug]/slots?doctor_id=&service_type_id=&date=YYYY-MM-DD
 *
 * Returns bookable slot start/end times for one doctor on one day.
 * `date` is treated as a UTC calendar day (no per-account timezone
 * exists yet to do this precisely) — acceptable for the MVP since
 * doctors declare their own availability blocks in absolute
 * timestamps already; a future timezone field would only sharpen the
 * day-boundary math, not change the underlying free/busy logic.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ip = getClientIp(request);
  const limit = checkRateLimit(`public-booking-slots:${ip}`, RATE_LIMITS.publicBookingRead);
  if (!limit.success) return rateLimitResponse(limit);

  const { slug } = await params;
  const url = new URL(request.url);
  const doctorId = url.searchParams.get("doctor_id");
  const serviceTypeId = url.searchParams.get("service_type_id");
  const date = url.searchParams.get("date");

  if (!doctorId || !serviceTypeId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "doctor_id, service_type_id and date (YYYY-MM-DD) are required" },
      { status: 400 },
    );
  }

  const admin = supabaseAdmin();

  const { data: account } = await admin
    .from("accounts")
    .select("id, public_booking_enabled")
    .eq("public_booking_slug", slug)
    .maybeSingle();
  if (!account || !account.public_booking_enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [{ data: doctor }, { data: serviceType }] = await Promise.all([
    admin
      .from("doctors")
      .select("id")
      .eq("id", doctorId)
      .eq("account_id", account.id)
      .eq("is_active", true)
      .maybeSingle(),
    admin
      .from("service_types")
      .select("duration_minutes")
      .eq("id", serviceTypeId)
      .eq("account_id", account.id)
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  if (!doctor || !serviceType) {
    return NextResponse.json({ error: "Doctor or service type not found" }, { status: 404 });
  }

  const rangeStart = new Date(`${date}T00:00:00.000Z`).toISOString();
  const rangeEnd = new Date(`${date}T00:00:00.000Z`);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);

  const slots = await computeAvailableSlots(admin, {
    accountId: account.id,
    doctorId,
    slotMinutes: serviceType.duration_minutes,
    rangeStart,
    rangeEnd: rangeEnd.toISOString(),
  });

  return NextResponse.json({ slots });
}
