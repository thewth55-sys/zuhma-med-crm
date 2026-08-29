// ============================================================
// Google Calendar sync dispatch — "never throws" (mirrors
// lib/conversions/dispatch.ts and the webhook delivery pattern): a
// Google API hiccup should never fail the appointment write that
// triggered it. Called from the three places that change an
// appointment (POST /api/appointments, PATCH and DELETE
// /api/appointments/[id]) — see those routes for the call sites.
//
// Any account member can connect their own Google Calendar (not just
// a linked doctor — 045_google_calendar_per_user.sql), and every
// appointment fans out to EVERY connected member's calendar, not just
// the assigned doctor's. That's a 1:many relationship between one
// appointment and many Google events, tracked in
// appointment_google_events (one row per appointment × connected
// user) rather than a single event id column on the appointment.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";

import { decrypt } from "@/lib/whatsapp/encryption";
import {
  refreshAccessToken,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
} from "@/lib/google-calendar/client";

interface SyncableAppointment {
  id: string;
  contact_id: string | null;
  room_id: string | null;
  start_at: string;
  end_at: string;
  status: string;
  notes: string | null;
}

interface ConnectedProfile {
  user_id: string;
  google_calendar_id: string | null;
  google_refresh_token: string;
}

async function getConnectedProfiles(
  supabase: SupabaseClient,
  accountId: string,
): Promise<ConnectedProfile[]> {
  const { data } = await supabase
    .from("profiles")
    .select("user_id, google_calendar_id, google_refresh_token")
    .eq("account_id", accountId)
    .eq("google_calendar_connected", true)
    .not("google_refresh_token", "is", null);
  return (data ?? []) as ConnectedProfile[];
}

/**
 * Create/update/cancel the Google Calendar event mirroring this
 * appointment, for every account member who has connected their own
 * calendar. No-ops silently when nobody in the account is connected —
 * the overwhelming majority of calls.
 */
export async function syncAppointmentToGoogle(
  supabase: SupabaseClient,
  accountId: string,
  appointment: SyncableAppointment,
): Promise<void> {
  try {
    const connected = await getConnectedProfiles(supabase, accountId);
    if (connected.length === 0) return;

    let summary = "Cita";
    let attendeeEmail: string | undefined;
    if (appointment.contact_id) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("name, phone, email")
        .eq("id", appointment.contact_id)
        .maybeSingle();
      summary = contact?.name || contact?.phone || summary;
      attendeeEmail = contact?.email || undefined;
    }

    let location: string | undefined;
    if (appointment.room_id) {
      const { data: room } = await supabase
        .from("rooms")
        .select("address")
        .eq("id", appointment.room_id)
        .maybeSingle();
      location = room?.address || undefined;
    }

    const eventInput = {
      summary: `Cita: ${summary}`,
      description: appointment.notes ?? undefined,
      location,
      attendeeEmail,
      startAt: appointment.start_at,
      endAt: appointment.end_at,
    };

    for (const profile of connected) {
      try {
        const accessToken = await refreshAccessToken(decrypt(profile.google_refresh_token));
        const calendarId = profile.google_calendar_id || "primary";

        const { data: link } = await supabase
          .from("appointment_google_events")
          .select("id, google_event_id")
          .eq("appointment_id", appointment.id)
          .eq("user_id", profile.user_id)
          .maybeSingle();

        if (appointment.status === "cancelled") {
          if (link) {
            await deleteCalendarEvent(accessToken, calendarId, link.google_event_id);
            await supabase.from("appointment_google_events").delete().eq("id", link.id);
          }
          continue;
        }

        if (link) {
          await updateCalendarEvent(accessToken, calendarId, link.google_event_id, eventInput);
        } else {
          const eventId = await createCalendarEvent(accessToken, calendarId, eventInput);
          await supabase.from("appointment_google_events").insert({
            appointment_id: appointment.id,
            user_id: profile.user_id,
            google_event_id: eventId,
          });
        }
      } catch (err) {
        // One user's expired/revoked grant shouldn't stop the sync
        // for everyone else connected.
        console.error(
          `[syncAppointmentToGoogle] failed for user ${profile.user_id}:`,
          err,
        );
      }
    }
  } catch (err) {
    console.error("[syncAppointmentToGoogle] failed (never throws):", err);
  }
}

/**
 * Removes every connected user's Google Calendar event for an
 * appointment that's about to be hard-deleted (DELETE
 * /api/appointments/[id]) — called BEFORE the row is deleted, since
 * it needs to read appointment_google_events first (which cascade-
 * deletes with the appointment).
 */
export async function removeAppointmentFromGoogle(
  supabase: SupabaseClient,
  accountId: string,
  appointmentId: string,
): Promise<void> {
  try {
    const { data: links } = await supabase
      .from("appointment_google_events")
      .select("user_id, google_event_id")
      .eq("appointment_id", appointmentId);
    if (!links || links.length === 0) return;

    const connected = await getConnectedProfiles(supabase, accountId);
    const byUserId = new Map(connected.map((p) => [p.user_id, p]));

    for (const link of links) {
      const profile = byUserId.get(link.user_id);
      if (!profile) continue;
      try {
        const accessToken = await refreshAccessToken(decrypt(profile.google_refresh_token));
        const calendarId = profile.google_calendar_id || "primary";
        await deleteCalendarEvent(accessToken, calendarId, link.google_event_id);
      } catch (err) {
        console.error(
          `[removeAppointmentFromGoogle] failed for user ${link.user_id}:`,
          err,
        );
      }
    }
  } catch (err) {
    console.error("[removeAppointmentFromGoogle] failed (never throws):", err);
  }
}
