import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/whatsapp/encryption";
import { refreshAccessToken, getFreeBusy } from "@/lib/google-calendar/client";
import { chunkIntoSlots, intersectRanges, subtractRanges, type TimeRange } from "./availability";
import { computeClinicRanges } from "./business-hours";

/**
 * Server-only slot computation for the public booking widget
 * (/agendar/[slug]). Always called with the service-role client —
 * there's no end-user session for an anonymous visitor.
 *
 * Bookable time is built from two layers:
 *  - The clinic's general business hours (feature C), if the account
 *    has any configured. These define the days/hours of service.
 *  - The doctor's own declared availability blocks (feature A), if any.
 *
 * How they combine (then minus appointments + Google Calendar busy):
 *  - Clinic hours configured + doctor has blocks that day → the
 *    intersection (doctor is bookable only where both overlap).
 *  - Clinic hours configured + doctor has NO blocks that day → the
 *    clinic hours (doctor available whenever the clinic is open). This
 *    is what lets a clinic go live just by setting general hours,
 *    without declaring per-doctor blocks.
 *  - No clinic hours configured → falls back to the original behavior:
 *    doctor's declared blocks only (a doctor with no blocks has no
 *    public slots).
 */
export async function computeAvailableSlots(
  admin: SupabaseClient,
  params: {
    accountId: string;
    doctorId: string;
    slotMinutes: number;
    rangeStart: string; // ISO
    rangeEnd: string; // ISO
    roomId?: string | null;
  },
): Promise<TimeRange[]> {
  const { accountId, doctorId, slotMinutes, rangeStart, rangeEnd, roomId } = params;

  const [blocksRes, apptsRes, doctorRes, clinic] = await Promise.all([
    admin
      .from("doctor_availability_blocks")
      .select("start_at, end_at")
      .eq("account_id", accountId)
      .eq("doctor_id", doctorId)
      .lt("start_at", rangeEnd)
      .gt("end_at", rangeStart),
    admin
      .from("appointments")
      .select("start_at, end_at")
      .eq("account_id", accountId)
      .eq("doctor_id", doctorId)
      .neq("status", "cancelled")
      .lt("start_at", rangeEnd)
      .gt("end_at", rangeStart),
    admin.from("doctors").select("user_id").eq("id", doctorId).maybeSingle(),
    computeClinicRanges(admin, accountId, rangeStart, rangeEnd, roomId),
  ]);

  const declaredBlocks = (blocksRes.data ?? []) as TimeRange[];
  const busy: TimeRange[] = [...((apptsRes.data ?? []) as TimeRange[])];

  // Best-effort Google Calendar overlay — same fail-open posture as
  // /api/google-calendar/busy-range: a missing connection or an
  // expired/unrefreshable token just means we skip this signal
  // rather than failing the whole public page.
  const doctorUserId = doctorRes.data?.user_id as string | undefined;
  if (doctorUserId) {
    const { data: profile } = await admin
      .from("profiles")
      .select("google_calendar_id, google_refresh_token")
      .eq("account_id", accountId)
      .eq("user_id", doctorUserId)
      .eq("google_calendar_connected", true)
      .not("google_refresh_token", "is", null)
      .maybeSingle();

    if (profile?.google_refresh_token) {
      try {
        const accessToken = await refreshAccessToken(decrypt(profile.google_refresh_token));
        const calendarId = profile.google_calendar_id || "primary";
        const periods = await getFreeBusy(accessToken, calendarId, rangeStart, rangeEnd);
        busy.push(...periods.map((p) => ({ start_at: p.start, end_at: p.end })));
      } catch (err) {
        console.error(`[public-booking] Google freeBusy failed for doctor ${doctorId}:`, err);
      }
    }
  }

  // Combine clinic hours (feature C) with the doctor's own blocks
  // (feature A). See the function doc for the three cases.
  let base: TimeRange[];
  if (clinic.configured) {
    base = declaredBlocks.length > 0 ? intersectRanges(declaredBlocks, clinic.ranges) : clinic.ranges;
  } else {
    base = declaredBlocks;
  }

  const free = subtractRanges(base, busy);
  const slots = chunkIntoSlots(free, slotMinutes);

  // Drop anything that's already started — a visitor browsing "today"
  // shouldn't be offered a slot 20 minutes in the past.
  const now = new Date();
  return slots.filter((s) => new Date(s.start_at) > now);
}

/** Personalización "link-in-bio" de la página pública (accounts.booking_page). */
export interface BookingPageConfig {
  accentColor?: string | null;
  coverImageUrl?: string | null;
  coverColor?: string | null;
  logoUrl?: string | null;
  headline?: string | null;
  tagline?: string | null;
  bio?: string | null;
  contact?: {
    whatsapp?: string | null;
    phone?: string | null;
    email?: string | null;
    mapUrl?: string | null;
  } | null;
  social?: {
    instagram?: string | null;
    facebook?: string | null;
    tiktok?: string | null;
    web?: string | null;
  } | null;
  showServices?: boolean;
  showDoctors?: boolean;
  showAddress?: boolean;
}

export interface PublicBookingConfig {
  accountId: string;
  accountName: string;
  accountLogoUrl: string | null;
  address: string | null;
  page: BookingPageConfig;
  doctors: { id: string; name: string; specialty: string | null }[];
  serviceTypes: { id: string; name: string; duration_minutes: number }[];
  /** Consultorios = ubicaciones. Vacío = clínica de una sola ubicación. */
  rooms: { id: string; name: string; address: string | null }[];
}

/**
 * Shared lookup behind both the SSR page (/agendar/[slug]) and the
 * config API route — resolves a published slug into the clinic name
 * plus its active doctors/service types, or null if the slug is
 * unclaimed or the account has paused its page.
 */
export async function getPublicBookingConfig(
  admin: SupabaseClient,
  slug: string,
): Promise<PublicBookingConfig | null> {
  const { data: account } = await admin
    .from("accounts")
    .select("id, name, public_booking_enabled, logo_url, address, booking_page")
    .eq("public_booking_slug", slug)
    .maybeSingle();

  if (!account || !account.public_booking_enabled) return null;

  const [{ data: doctors }, { data: serviceTypes }, { data: rooms }] = await Promise.all([
    admin
      .from("doctors")
      .select("id, name, specialty")
      .eq("account_id", account.id)
      .eq("is_active", true)
      .order("name"),
    admin
      .from("service_types")
      .select("id, name, duration_minutes")
      .eq("account_id", account.id)
      .eq("is_active", true)
      .order("name"),
    admin
      .from("rooms")
      .select("id, name, address")
      .eq("account_id", account.id)
      .eq("is_active", true)
      .order("name"),
  ]);

  return {
    accountId: account.id,
    accountName: account.name,
    accountLogoUrl: account.logo_url ?? null,
    address: account.address ?? null,
    page: (account.booking_page as BookingPageConfig | null) ?? {},
    doctors: doctors ?? [],
    serviceTypes: serviceTypes ?? [],
    rooms: rooms ?? [],
  };
}
