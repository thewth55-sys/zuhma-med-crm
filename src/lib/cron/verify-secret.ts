import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time comparison for the `x-cron-secret` header both cron
 * routes (automations/cron, billing-platform/cron) check against
 * their own env var. A plain `!==` leaks how many leading characters
 * matched via response-time variance — cheap insurance against that,
 * matching the timing-safe comparisons already used for the WhatsApp/
 * Cal.com webhook signatures and API keys elsewhere in this codebase.
 */
export function timingSafeSecretEqual(supplied: string | null, expected: string): boolean {
  if (!supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
