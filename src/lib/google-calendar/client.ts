// ============================================================
// Google Calendar — plain fetch REST client, no `googleapis` SDK.
// Mirrors the style of lib/whatsapp/meta-api.ts (single fetch per
// call, throws on non-2xx) rather than pulling in Google's official
// Node client, which drags in most of their API surface for the ~7
// endpoints (auth code exchange, token refresh, events.insert/patch/
// delete, freeBusy.query) this integration actually needs.
//
// Sync direction: Zentro Med → Google Calendar is one-way (create/
// update/delete events on each connected calendar) — an edit made
// directly in Google never flows back as a Zentro Med appointment.
// The ONE read-back exception is getFreeBusy(): it checks whether a
// connected doctor already has something on their Google Calendar at
// a candidate appointment time, to warn staff before double-booking.
// It never reads event details and never creates a Zentro Med record
// from what it finds — see appointment-editor-dialog.tsx.
// ============================================================

const OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

// `calendar.events` — create/read/update/delete events. `calendar.freebusy`
// — see busy/free time only, no event details, no access to calendar
// settings or other calendars the doctor owns. Deliberately NOT the
// broader `calendar`/`calendar.readonly` scopes, which would also expose
// event titles/attendees/descriptions this app has no use for.
//
// Note: an already-connected profile's refresh token only carries the
// scope(s) granted at connect time. Accounts that connected before
// calendar.freebusy was added here will get a silent "not busy" result
// from getFreeBusy (see the try/catch in the freebusy API route) until
// they disconnect and reconnect.
const SCOPE = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy";

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function redirectUri(): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || "https://med.zentrolabs.com";
  return `${siteUrl}/api/google-calendar/callback`;
}

/**
 * Builds the consent-screen URL. `state` carries the doctor id so the
 * callback can resolve which doctor row to attach the tokens to
 * without relying on session state surviving the round-trip to
 * Google and back (it does, via cookies, but state is the documented
 * OAuth mechanism for this and survives even if a cookie doesn't).
 */
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getEnv("GOOGLE_CLIENT_ID"),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline", // required to receive a refresh_token
    prompt: "consent", // forces refresh_token on every connect, not just the first
    state,
  });
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getEnv("GOOGLE_CLIENT_ID"),
      client_secret: getEnv("GOOGLE_CLIENT_SECRET"),
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri(),
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${data.error_description || data.error || res.status}`);
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresIn: data.expires_in,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getEnv("GOOGLE_CLIENT_ID"),
      client_secret: getEnv("GOOGLE_CLIENT_SECRET"),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Google token refresh failed: ${data.error_description || data.error || res.status}`);
  }
  return data.access_token;
}

export interface CalendarEventInput {
  summary: string;
  description?: string;
  location?: string;
  /** Patient's email, invited as an attendee — this is what makes
   *  Google actually send them a notification (see sendUpdates=all
   *  below); without an attendee there's no one to notify. */
  attendeeEmail?: string;
  startAt: string; // ISO
  endAt: string; // ISO
}

// `sendUpdates=all` — required for Google to email attendees at all;
// its default ("insert" default is effectively "all" but PATCH
// defaults to "none", so this must be explicit on both write paths)
// notifies both the attendee (the patient) and other guests.
const SEND_UPDATES_PARAM = "sendUpdates=all";

export async function createCalendarEvent(
  accessToken: string,
  calendarId: string,
  event: CalendarEventInput,
): Promise<string> {
  const res = await fetch(
    `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${SEND_UPDATES_PARAM}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: event.summary,
        description: event.description,
        location: event.location,
        attendees: event.attendeeEmail ? [{ email: event.attendeeEmail }] : undefined,
        start: { dateTime: event.startAt },
        end: { dateTime: event.endAt },
      }),
    },
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Google Calendar event create failed: ${data.error?.message || res.status}`);
  }
  return data.id;
}

export async function updateCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  event: CalendarEventInput,
): Promise<void> {
  const res = await fetch(
    `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?${SEND_UPDATES_PARAM}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: event.summary,
        description: event.description,
        location: event.location,
        attendees: event.attendeeEmail ? [{ email: event.attendeeEmail }] : undefined,
        start: { dateTime: event.startAt },
        end: { dateTime: event.endAt },
      }),
    },
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`Google Calendar event update failed: ${data.error?.message || res.status}`);
  }
}

export async function deleteCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const res = await fetch(
    `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  // 410 Gone = already deleted on Google's side (e.g. the doctor
  // deleted it themselves) — treat as success, nothing left to do.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`Google Calendar event delete failed: ${data.error?.message || res.status}`);
  }
}

export interface BusyPeriod {
  start: string;
  end: string;
}

/**
 * freeBusy.query — the one read-back call this integration makes.
 * Returns the busy intervals for `calendarId` within [timeMin,
 * timeMax), with no event details (titles/attendees/descriptions
 * aren't in the response at all, so there's nothing sensitive to
 * accidentally surface in the Zentro Med UI).
 */
export async function getFreeBusy(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
): Promise<BusyPeriod[]> {
  const res = await fetch(`${CALENDAR_API_BASE}/freeBusy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      items: [{ id: calendarId }],
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Google Calendar freeBusy failed: ${data.error?.message || res.status}`);
  }
  const calendarResult = data.calendars?.[calendarId];
  if (calendarResult?.errors?.length) {
    throw new Error(`Google Calendar freeBusy failed: ${calendarResult.errors[0].reason}`);
  }
  return (calendarResult?.busy ?? []) as BusyPeriod[];
}
