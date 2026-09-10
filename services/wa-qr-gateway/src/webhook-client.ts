// Delivers inbound QR messages to the monolith's
// src/app/api/whatsapp/qr-webhook/route.ts — mirrors the shape that
// route expects (see that file). Protected the same way outbound calls
// to this gateway are (a shared-secret header), just the other
// direction.

export interface QrInboundPayload {
  accountId: string;
  whatsappSessionId: string;
  externalMessageId: string;
  senderPhone: string;
  contactName?: string;
  /** 'text' | 'image' | 'video' | 'audio' | 'document' — matches the
   *  monolith's ALLOWED_CONTENT_TYPES (deliver-inbound-message.ts). */
  contentType: string;
  /** The message text, or a media message's caption. Null for
   *  uncaptioned media. */
  contentText: string | null;
  /** Set only for media messages — a path under the monolith's
   *  /api/whatsapp/qr-media proxy, not a directly-fetchable URL. */
  mediaUrl: string | null;
  timestamp: number;
}

export async function notifyInboundMessage(payload: QrInboundPayload): Promise<void> {
  const url = process.env.MONOLITH_QR_WEBHOOK_URL;
  const secret = process.env.WA_QR_WEBHOOK_SECRET;
  if (!url || !secret) {
    console.error('[webhook-client] MONOLITH_QR_WEBHOOK_URL / WA_QR_WEBHOOK_SECRET not configured — dropping inbound message', payload);
    return;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-qr-webhook-secret': secret,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[webhook-client] monolith returned ${res.status}: ${body.slice(0, 300)}`);
    }
  } catch (err) {
    console.error('[webhook-client] failed to reach monolith:', err);
  }
}
