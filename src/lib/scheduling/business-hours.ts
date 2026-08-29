import type { SupabaseClient } from "@supabase/supabase-js";
import type { TimeRange } from "./availability";

/**
 * Clinic-hours helper for feature C. Turns the account's weekly
 * `business_hours` rows (local wall-clock open/close per weekday) into
 * concrete UTC `TimeRange`s for a given window, honoring the account's
 * IANA timezone (`accounts.timezone`, default America/Mexico_City).
 *
 * Pure timezone math via Intl — no external date library. Mexico no
 * longer observes DST (America/Mexico_City is a fixed offset since
 * 2023), but the single-pass offset lookup below is correct for any
 * wall-clock time that isn't inside a DST spring-forward gap, which is
 * good enough for clinic opening hours.
 */

export interface BusinessHourRow {
  weekday: number; // 0=Sunday … 6=Saturday
  open_time: string; // "HH:MM:SS"
  close_time: string; // "HH:MM:SS"
}

/** (localWallClock − utc) in ms for `tz` at the given instant. */
function tzOffsetMs(instant: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) map[p.type] = p.value;
  const asUTC = Date.UTC(
    +map.year,
    +map.month - 1,
    +map.day,
    +map.hour,
    +map.minute,
    +map.second,
  );
  return asUTC - instant.getTime();
}

/** Interpret Y-M-D H:M:S as wall-clock in `tz`, return the UTC instant. */
function zonedWallTimeToUtc(
  y: number,
  mo: number,
  d: number,
  hh: number,
  mm: number,
  ss: number,
  tz: string,
): Date {
  const guessMs = Date.UTC(y, mo - 1, d, hh, mm, ss);
  const off = tzOffsetMs(new Date(guessMs), tz);
  return new Date(guessMs - off);
}

/**
 * Public helper: interpret a "YYYY-MM-DD" date + "HH:MM" wall-clock
 * time as local time in `tz` and return the UTC instant as ISO. Used
 * when staff declare a doctor's availability block in clinic-local time
 * (feature A) so it lines up with clinic hours (feature C).
 */
export function localDateTimeToUtcISO(dateYMD: string, timeHM: string, tz: string): string {
  const [y, mo, d] = dateYMD.split("-").map(Number);
  const [hh, mm] = timeHM.split(":").map(Number);
  return zonedWallTimeToUtc(y, mo, d, hh, mm, 0, tz).toISOString();
}

/** Local calendar Y/M/D of an instant in `tz`. */
function localYMD(instant: Date, tz: string): { y: number; mo: number; d: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) map[p.type] = p.value;
  return { y: +map.year, mo: +map.month, d: +map.day };
}

function parseHMS(t: string): [number, number, number] {
  const [hh = "0", mm = "0", ss = "0"] = t.split(":");
  return [+hh, +mm, +ss];
}

/**
 * Is the account currently within its business hours (any room open)?
 * Used by the unanswered-conversation reminder cron to suppress the short
 * escalation steps at night — outside hours only the hourly reminder fires.
 *
 * Union across every room's `business_hours` rows: the clinic counts as
 * "open" if any room is open right now. Returns `configured: false` (and
 * `open: true`) when no hours are set at all, so callers that key off this
 * default to the full 24/7 curve rather than silently going quiet.
 */
export async function isWithinBusinessHoursNow(
  admin: SupabaseClient,
  accountId: string,
  now: Date = new Date(),
): Promise<{ open: boolean; configured: boolean }> {
  const [{ data: account }, { data: rows }] = await Promise.all([
    admin.from("accounts").select("timezone").eq("id", accountId).maybeSingle(),
    admin.from("business_hours").select("weekday, open_time, close_time").eq("account_id", accountId),
  ]);

  const hours = (rows ?? []) as BusinessHourRow[];
  if (hours.length === 0) return { open: true, configured: false };

  const tz = (account?.timezone as string) || "America/Mexico_City";
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const m: Record<string, string> = {};
  for (const p of dtf.formatToParts(now)) m[p.type] = p.value;

  // Weekday (0=Sunday) of the local calendar day, matching business_hours.weekday.
  const weekday = new Date(Date.UTC(+m.year, +m.month - 1, +m.day)).getUTCDay();
  const secOfDay = +m.hour * 3600 + +m.minute * 60 + +m.second;

  for (const h of hours) {
    if (h.weekday !== weekday) continue;
    const [oh, om, os] = parseHMS(h.open_time);
    const [ch, cm, cs] = parseHMS(h.close_time);
    const openSec = oh * 3600 + om * 60 + os;
    const closeSec = ch * 3600 + cm * 60 + cs;
    if (secOfDay >= openSec && secOfDay < closeSec) return { open: true, configured: true };
  }
  return { open: false, configured: true };
}

/**
 * Builds the clinic's open windows (as UTC ranges) that overlap
 * [rangeStart, rangeEnd), from the account's weekly business hours.
 * Returns [] if the account has no business hours configured — callers
 * treat that as "no clinic-hours constraint" (backward compatible).
 */
export async function computeClinicRanges(
  admin: SupabaseClient,
  accountId: string,
  rangeStart: string,
  rangeEnd: string,
  roomId?: string | null,
): Promise<{ ranges: TimeRange[]; configured: boolean }> {
  // Horarios POR CONSULTORIO (migración 081): sin roomId no hay horario de
  // clínica que aplicar (se cae al comportamiento de bloques del médico).
  if (!roomId) {
    const { data: account } = await admin
      .from("accounts")
      .select("timezone")
      .eq("id", accountId)
      .maybeSingle();
    void account;
    return { ranges: [], configured: false };
  }

  const [{ data: account }, { data: rows }] = await Promise.all([
    admin.from("accounts").select("timezone").eq("id", accountId).maybeSingle(),
    admin
      .from("business_hours")
      .select("weekday, open_time, close_time")
      .eq("account_id", accountId)
      .eq("room_id", roomId),
  ]);

  const hours = (rows ?? []) as BusinessHourRow[];
  if (hours.length === 0) return { ranges: [], configured: false };

  const tz = (account?.timezone as string) || "America/Mexico_City";
  const startMs = new Date(rangeStart).getTime();
  const endMs = new Date(rangeEnd).getTime();

  // Enumerate the local calendar days that could overlap the window
  // (± a day of buffer to cover timezone offset at the edges).
  const byWeekday = new Map<number, BusinessHourRow[]>();
  for (const h of hours) {
    const list = byWeekday.get(h.weekday) ?? [];
    list.push(h);
    byWeekday.set(h.weekday, list);
  }

  const ranges: TimeRange[] = [];
  const firstDay = localYMD(new Date(startMs - 24 * 3600_000), tz);
  const cursor = new Date(Date.UTC(firstDay.y, firstDay.mo - 1, firstDay.d));
  for (let i = 0; i < 4; i++) {
    const y = cursor.getUTCFullYear();
    const mo = cursor.getUTCMonth() + 1;
    const d = cursor.getUTCDate();
    const weekday = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
    for (const h of byWeekday.get(weekday) ?? []) {
      const [oh, om, os] = parseHMS(h.open_time);
      const [ch, cm, cs] = parseHMS(h.close_time);
      const openUtc = zonedWallTimeToUtc(y, mo, d, oh, om, os, tz).getTime();
      const closeUtc = zonedWallTimeToUtc(y, mo, d, ch, cm, cs, tz).getTime();
      const clampStart = Math.max(openUtc, startMs);
      const clampEnd = Math.min(closeUtc, endMs);
      if (clampStart < clampEnd) {
        ranges.push({
          start_at: new Date(clampStart).toISOString(),
          end_at: new Date(clampEnd).toISOString(),
        });
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return { ranges, configured: true };
}
