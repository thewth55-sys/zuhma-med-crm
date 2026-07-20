/**
 * Pure time-range helpers for the scheduling module — no I/O, safe to
 * unit test directly. Used by the deal-form Cita panel (conflict
 * warning) and, in later phases, the Agenda view and the Cal.com
 * availability push.
 */

export interface TimeRange {
  start_at: string;
  end_at: string;
}

/** True if two [start, end) ranges overlap at all. */
export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return new Date(a.start_at) < new Date(b.end_at) && new Date(b.start_at) < new Date(a.end_at);
}

/**
 * True if `candidate` overlaps any range in `existing`. Used to warn
 * staff that a doctor or room is already booked for the time they're
 * about to assign — advisory only, not enforced by a DB constraint,
 * since double-booking might occasionally be a deliberate call.
 */
export function hasConflict(existing: TimeRange[], candidate: TimeRange): boolean {
  return existing.some((r) => rangesOverlap(r, candidate));
}

/**
 * Merges overlapping/adjacent ranges into the minimal covering set.
 * Used (Phase B) to turn every doctor's individual availability
 * blocks into the clinic's aggregate "someone is here" schedule
 * pushed to Cal.com.
 */
export function unionRanges(ranges: TimeRange[]): TimeRange[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
  );
  const merged: TimeRange[] = [{ ...sorted[0] }];
  for (const r of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (new Date(r.start_at) <= new Date(last.end_at)) {
      if (new Date(r.end_at) > new Date(last.end_at)) last.end_at = r.end_at;
    } else {
      merged.push({ ...r });
    }
  }
  return merged;
}

/**
 * Subtracts `busy` ranges from `base` ranges, returning the leftover
 * free sub-ranges. Used by the public booking widget to turn a
 * doctor's declared availability blocks into actual bookable slots
 * once existing appointments and Google Calendar busy time are
 * removed. `busy` is unioned first so overlapping busy ranges don't
 * produce spurious tiny gaps between them.
 */
export function subtractRanges(base: TimeRange[], busy: TimeRange[]): TimeRange[] {
  if (base.length === 0) return [];
  const mergedBusy = unionRanges(busy);
  if (mergedBusy.length === 0) return base.map((r) => ({ ...r }));

  const result: TimeRange[] = [];
  for (const range of base) {
    let cursor = new Date(range.start_at);
    const rangeEnd = new Date(range.end_at);
    for (const b of mergedBusy) {
      const busyStart = new Date(b.start_at);
      const busyEnd = new Date(b.end_at);
      if (busyEnd <= cursor || busyStart >= rangeEnd) continue;
      if (busyStart > cursor) {
        result.push({ start_at: cursor.toISOString(), end_at: busyStart.toISOString() });
      }
      if (busyEnd > cursor) cursor = busyEnd;
      if (cursor >= rangeEnd) break;
    }
    if (cursor < rangeEnd) {
      result.push({ start_at: cursor.toISOString(), end_at: rangeEnd.toISOString() });
    }
  }
  return result;
}

/**
 * Chops free ranges into discrete `slotMinutes`-long bookable slots,
 * aligned to each range's own start (not wall-clock boundaries) —
 * simplest correct behavior given availability blocks are declared
 * by doctors themselves, not derived from fixed business hours.
 * Partial trailing slots (shorter than `slotMinutes`) are dropped.
 */
export function chunkIntoSlots(free: TimeRange[], slotMinutes: number): TimeRange[] {
  const slotMs = slotMinutes * 60_000;
  const slots: TimeRange[] = [];
  for (const range of free) {
    let cursor = new Date(range.start_at).getTime();
    const end = new Date(range.end_at).getTime();
    while (cursor + slotMs <= end) {
      slots.push({
        start_at: new Date(cursor).toISOString(),
        end_at: new Date(cursor + slotMs).toISOString(),
      });
      cursor += slotMs;
    }
  }
  return slots;
}
