import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/billing-platform/admin-client";
import { findExistingContact, isUniqueViolation } from "@/lib/contacts/dedupe";
import { normalizePhone } from "@/lib/whatsapp/phone-utils";
import { computeAvailableSlots } from "@/lib/scheduling/public-booking";
import { notifyAccountTeam } from "@/lib/email/notify-team";
import { escapeHtml } from "@/lib/email/branded-template";
import { checkRateLimit, getClientIp, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

interface BookBody {
  doctor_id?: string;
  service_type_id?: string;
  start_at?: string;
  name?: string;
  phone?: string;
  email?: string;
}

/**
 * POST /api/public/booking/[slug]/book — creates a Contact (deduped
 * by phone, same helper the WhatsApp webhook/manual form/CSV import
 * use) and an Appointment with source='public_booking'.
 *
 * Re-validates the requested slot against `computeAvailableSlots`
 * right before inserting — the widget's earlier GET .../slots call
 * could be stale by the time the visitor submits (another visitor
 * took the slot, or staff booked it manually in between). Fails
 * closed on any mismatch rather than trusting the client-submitted
 * start/end.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ip = getClientIp(request);
  const limit = checkRateLimit(`public-booking-create:${ip}`, RATE_LIMITS.publicBookingCreate);
  if (!limit.success) return rateLimitResponse(limit);

  const { slug } = await params;
  const body = (await request.json().catch(() => null)) as BookBody | null;

  if (!body?.doctor_id || !body.service_type_id || !body.start_at || !body.name || !body.phone) {
    return NextResponse.json(
      { error: "doctor_id, service_type_id, start_at, name and phone are required" },
      { status: 400 },
    );
  }
  const normalizedPhone = normalizePhone(body.phone);
  if (normalizedPhone.length < 8) {
    return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: account } = await admin
    .from("accounts")
    .select("id, owner_user_id, public_booking_enabled")
    .eq("public_booking_slug", slug)
    .maybeSingle();
  if (!account || !account.public_booking_enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [{ data: doctor }, { data: serviceType }] = await Promise.all([
    admin
      .from("doctors")
      .select("id, name")
      .eq("id", body.doctor_id)
      .eq("account_id", account.id)
      .eq("is_active", true)
      .maybeSingle(),
    admin
      .from("service_types")
      .select("id, name, duration_minutes")
      .eq("id", body.service_type_id)
      .eq("account_id", account.id)
      .eq("is_active", true)
      .maybeSingle(),
  ]);
  if (!doctor || !serviceType) {
    return NextResponse.json({ error: "Doctor or service type not found" }, { status: 404 });
  }

  const startAt = new Date(body.start_at);
  if (Number.isNaN(startAt.getTime()) || startAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "Invalid or past start_at" }, { status: 400 });
  }
  const endAt = new Date(startAt.getTime() + serviceType.duration_minutes * 60_000);

  // Re-check the slot is still free, scoped tightly to just this
  // candidate window (cheap — one doctor, one day).
  const dayStart = new Date(startAt);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const freshSlots = await computeAvailableSlots(admin, {
    accountId: account.id,
    doctorId: doctor.id,
    slotMinutes: serviceType.duration_minutes,
    rangeStart: dayStart.toISOString(),
    rangeEnd: dayEnd.toISOString(),
  });
  const stillAvailable = freshSlots.some((s) => s.start_at === startAt.toISOString());
  if (!stillAvailable) {
    return NextResponse.json(
      { error: "That slot is no longer available. Please pick another." },
      { status: 409 },
    );
  }

  const existingContact = await findExistingContact(admin, account.id, body.phone);
  let contactId: string;
  if (existingContact) {
    contactId = existingContact.id;
  } else {
    const { data: newContact, error: createError } = await admin
      .from("contacts")
      .insert({
        account_id: account.id,
        user_id: account.owner_user_id,
        phone: body.phone,
        name: body.name,
        email: body.email || null,
      })
      .select("id")
      .single();
    if (createError) {
      if (isUniqueViolation(createError)) {
        const raced = await findExistingContact(admin, account.id, body.phone);
        if (!raced) {
          return NextResponse.json({ error: "Could not create contact" }, { status: 500 });
        }
        contactId = raced.id;
      } else {
        console.error("[public booking] contact create failed:", createError);
        return NextResponse.json({ error: "Could not create contact" }, { status: 500 });
      }
    } else {
      contactId = newContact.id;
    }
  }

  const { data: appointment, error: apptError } = await admin
    .from("appointments")
    .insert({
      account_id: account.id,
      contact_id: contactId,
      doctor_id: doctor.id,
      service_type_id: serviceType.id,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      status: "pending",
      source: "public_booking",
    })
    .select("id, start_at, end_at")
    .single();

  if (apptError) {
    console.error("[public booking] appointment create failed:", apptError);
    return NextResponse.json({ error: "Could not create appointment" }, { status: 500 });
  }

  const startLabel = new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(startAt);
  void notifyAccountTeam(admin, {
    accountId: account.id,
    subject: `Nueva cita agendada — ${body.name}`,
    heading: "Nueva cita agendada en línea",
    bodyHtml: `<p><strong>${escapeHtml(body.name)}</strong> agendó una cita para <strong>${escapeHtml(startLabel)}</strong> con ${escapeHtml(doctor.name)} (${escapeHtml(serviceType.name)}).</p><p>Teléfono: ${escapeHtml(body.phone)}</p>`,
  });

  return NextResponse.json({ appointment });
}
