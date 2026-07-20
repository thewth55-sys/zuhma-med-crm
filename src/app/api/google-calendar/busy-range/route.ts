import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { decrypt } from "@/lib/whatsapp/encryption";
import { refreshAccessToken, getFreeBusy } from "@/lib/google-calendar/client";

interface DoctorBusyPeriod {
  doctorId: string;
  start: string;
  end: string;
}

/**
 * GET /api/google-calendar/busy-range?from=ISO&to=ISO&doctor_id=X? —
 * read-only busy periods (no event details) for every doctor with a
 * connected Google Calendar, within [from, to). Feeds the agenda
 * calendar's background "busy" blocks — see
 * agenda-calendar-view.tsx — as opposed to /freebusy, which answers a
 * single yes/no for one candidate appointment slot.
 *
 * Same fail-open behavior as /freebusy: a doctor with no linked
 * account, no connection, or a token that can't be refreshed (expired
 * grant, or predates the calendar.freebusy scope) is silently
 * skipped rather than failing the whole request — the calendar should
 * still render for everyone else.
 */
export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await requireRole("viewer");
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const doctorId = url.searchParams.get("doctor_id");

    if (!from || !to) {
      return NextResponse.json({ error: "from and to are required" }, { status: 400 });
    }

    let doctorQuery = supabase
      .from("doctors")
      .select("id, user_id")
      .eq("account_id", accountId)
      .not("user_id", "is", null);
    if (doctorId) doctorQuery = doctorQuery.eq("id", doctorId);
    const { data: doctors } = await doctorQuery;
    if (!doctors || doctors.length === 0) {
      return NextResponse.json({ busy: [] });
    }

    const userIds = doctors.map((d) => d.user_id as string);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, google_calendar_id, google_refresh_token")
      .eq("account_id", accountId)
      .eq("google_calendar_connected", true)
      .not("google_refresh_token", "is", null)
      .in("user_id", userIds);

    const profileByUserId = new Map((profiles ?? []).map((p) => [p.user_id, p]));

    const results = await Promise.all(
      doctors.map(async (doctor): Promise<DoctorBusyPeriod[]> => {
        const profile = profileByUserId.get(doctor.user_id as string);
        if (!profile?.google_refresh_token) return [];
        try {
          const accessToken = await refreshAccessToken(decrypt(profile.google_refresh_token));
          const calendarId = profile.google_calendar_id || "primary";
          const periods = await getFreeBusy(accessToken, calendarId, from, to);
          return periods.map((p) => ({ doctorId: doctor.id, start: p.start, end: p.end }));
        } catch (err) {
          console.error(`[GET /api/google-calendar/busy-range] failed for doctor ${doctor.id}:`, err);
          return [];
        }
      }),
    );

    return NextResponse.json({ busy: results.flat() });
  } catch (err) {
    return toErrorResponse(err);
  }
}
