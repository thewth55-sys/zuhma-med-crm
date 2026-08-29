import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { decrypt } from "@/lib/whatsapp/encryption";
import { refreshAccessToken, getFreeBusy } from "@/lib/google-calendar/client";

/**
 * GET /api/google-calendar/freebusy?doctor_id=X&from=ISO&to=ISO —
 * read-only check of whether the doctor's connected Google Calendar
 * already has something in [from, to). Used by the appointment editor
 * to warn staff before double-booking someone who also keeps a
 * personal calendar — it does NOT read event details and does NOT
 * create any Zuhma Med CRM record from what it finds.
 *
 * Always resolves with `{ busy, connected }` rather than a 4xx/5xx for
 * any of "doctor has no linked account", "not connected", "expired
 * grant", "token predates the freebusy scope" — a hiccup here should
 * never block the appointment editor from being usable, only skip the
 * (best-effort) warning.
 */
export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await requireRole("viewer");
    const url = new URL(request.url);
    const doctorId = url.searchParams.get("doctor_id");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (!doctorId || !from || !to) {
      return NextResponse.json({ error: "doctor_id, from, and to are required" }, { status: 400 });
    }

    const { data: doctor } = await supabase
      .from("doctors")
      .select("user_id")
      .eq("id", doctorId)
      .eq("account_id", accountId)
      .maybeSingle();
    if (!doctor?.user_id) {
      return NextResponse.json({ busy: false, connected: false });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("google_calendar_id, google_refresh_token")
      .eq("user_id", doctor.user_id)
      .eq("account_id", accountId)
      .eq("google_calendar_connected", true)
      .not("google_refresh_token", "is", null)
      .maybeSingle();
    if (!profile?.google_refresh_token) {
      return NextResponse.json({ busy: false, connected: false });
    }

    try {
      const accessToken = await refreshAccessToken(decrypt(profile.google_refresh_token));
      const calendarId = profile.google_calendar_id || "primary";
      const busyPeriods = await getFreeBusy(accessToken, calendarId, from, to);
      const busy = busyPeriods.length > 0;
      return NextResponse.json({ busy, connected: true });
    } catch (err) {
      // Expired/revoked grant, or a token issued before the
      // calendar.freebusy scope was added — fail open (no warning)
      // rather than surface an error the user can't act on.
      console.error("[GET /api/google-calendar/freebusy] check failed:", err);
      return NextResponse.json({ busy: false, connected: true });
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
