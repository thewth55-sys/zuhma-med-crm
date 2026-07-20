import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/whatsapp/encryption";
import { refreshAccessToken, getFreeBusy } from "@/lib/google-calendar/client";
import { chunkIntoSlots, subtractRanges, type TimeRange } from "./availability";

/**
 * Server-only slot computation for the public booking widget
 * (/agendar/[slug]). Always called with the service-role client —
 * there's no end-user session for an anonymous visitor.
 *
 * Bookable time = the doctor's declared availability blocks, minus
 * existing appointments, minus Google Calendar busy time (if
 * connected) — the exact same sources the internal Agenda view
 * already treats as authoritative, just recombined for public
 * consumption. A doctor with no declared blocks simply has no public
 * slots; that's an existing, documented property of
 * `doctor_availability_blocks`, not a new gap introduced here.
 */
export async function computeAvailableSlots(
  admin: SupabaseClient,
  params: {
    accountId: string;
    doctorId: string;
    slotMinutes: number;
    rangeStart: string; // ISO
    rangeEnd: string; // ISO
  },
): Promise<TimeRange[]> {
  const { accountId, doctorId, slotMinutes, rangeStart, rangeEnd } = params;

  const [blocksRes, apptsRes, doctorRes] = await Promise.all([
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

  const free = subtractRanges(declaredBlocks, busy);
  const slots = chunkIntoSlots(free, slotMinutes);

  // Drop anything that's already started — a visitor browsing "today"
  // shouldn't be offered a slot 20 minutes in the past.
  const now = new Date();
  return slots.filter((s) => new Date(s.start_at) > now);
}

export interface PublicBookingConfig {
  accountId: string;
  accountName: string;
  doctors: { id: string; name: string; specialty: string | null }[];
  serviceTypes: { id: string; name: string; duration_minutes: number }[];
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
    .select("id, name, public_booking_enabled")
    .eq("public_booking_slug", slug)
    .maybeSingle();

  if (!account || !account.public_booking_enabled) return null;

  const [{ data: doctors }, { data: serviceTypes }] = await Promise.all([
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
  ]);

  return {
    accountId: account.id,
    accountName: account.name,
    doctors: doctors ?? [],
    serviceTypes: serviceTypes ?? [],
  };
}
