import crypto from "node:crypto";

/**
 * Verify the HMAC-SHA256 signature Cal.com attaches to webhook POSTs.
 *
 * Cal.com signs the raw request body with the webhook's own secret
 * (set when you create the webhook in Cal.com → Settings →
 * Developer → Webhooks) and sends the result in the
 * `x-cal-signature-256` header as a plain hex digest (no `sha256=`
 * prefix, unlike Meta's webhook signature — see
 * whatsapp/webhook-signature.ts for that variant).
 *
 * Reference: https://cal.com/docs/core-features/webhooks
 *
 * Contract: `secret` is required and passed in by the caller rather
 * than read here directly — the current caller (the webhook route)
 * looks up each account's own `cal_com_webhook_secret` (migration
 * 054), so this function has no idea whether the secret is shared or
 * per-account; that's the caller's job. Fails closed on a missing or
 * mismatched signature.
 */
export function verifyCalComWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!secret || !signatureHeader) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
