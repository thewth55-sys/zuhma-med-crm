// ============================================================
// Thin HTTP client for the wa-qr-gateway service (services/wa-qr-gateway/)
// — the separate long-running process that holds the Baileys/WhatsApp
// Web sessions this monolith cannot (a Next.js API route can't keep a
// WebSocket alive between requests). Every call here is server-to-
// server over the two containers' shared internal network, guarded by
// a shared secret — same shape as the existing x-cron-secret pattern
// (src/lib/cron/verify-secret.ts), just used as an outbound header
// here instead of something we verify.
//
// This is intentionally the ONLY place in the monolith that knows the
// gateway's HTTP shape — provider-dispatch.ts and the /api/whatsapp/qr/*
// routes both go through these functions rather than building requests
// themselves.
// ============================================================

class QrGatewayError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'QrGatewayError';
    this.status = status;
  }
}

function gatewayUrl(path: string): string {
  const base = process.env.WA_QR_GATEWAY_URL;
  if (!base) {
    throw new QrGatewayError('WA_QR_GATEWAY_URL is not configured', 503);
  }
  return `${base.replace(/\/$/, '')}${path}`;
}

async function gatewayFetch(path: string, init: RequestInit = {}) {
  const secret = process.env.WA_QR_GATEWAY_SECRET;
  if (!secret) {
    throw new QrGatewayError('WA_QR_GATEWAY_SECRET is not configured', 503);
  }

  let res: Response;
  try {
    res = await fetch(gatewayUrl(path), {
      ...init,
      headers: {
        'content-type': 'application/json',
        'x-qr-gateway-secret': secret,
        ...(init.headers ?? {}),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'network error';
    throw new QrGatewayError(`wa-qr-gateway unreachable: ${message}`, 502);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new QrGatewayError(
      `wa-qr-gateway returned ${res.status}: ${body.slice(0, 300)}`,
      502
    );
  }

  return res.json();
}

export { QrGatewayError };

/** Ask the gateway to start (or restart) a Baileys session for this
 *  account. The gateway persists its own auth state in
 *  whatsapp_config.qr_auth_state — this call is what kicks off (or
 *  resumes) the socket that will eventually populate qr_current_code /
 *  qr_connection_state on that row. */
export async function connectQrSession(accountId: string): Promise<void> {
  await gatewayFetch('/connect', {
    method: 'POST',
    body: JSON.stringify({ accountId }),
  });
}

/** Log out the Baileys session and clear its persisted auth state.
 *  The account can reconnect later, which starts a fresh pairing
 *  (new QR to scan) rather than resuming the old one. */
export async function disconnectQrSession(accountId: string): Promise<void> {
  await gatewayFetch('/disconnect', {
    method: 'POST',
    body: JSON.stringify({ accountId }),
  });
}

/** Send a plain-text message through an account's QR-connected line. */
export async function sendQrTextMessage(args: {
  accountId: string;
  to: string;
  text: string;
}): Promise<{ messageId: string }> {
  const data = await gatewayFetch('/send', {
    method: 'POST',
    body: JSON.stringify(args),
  });
  return { messageId: data.messageId };
}

/** Send an image, video, audio, or document via a public URL — the
 *  gateway fetches `link` itself and re-uploads it (encrypted) to
 *  WhatsApp's media servers, same "just give me a link" model as
 *  Meta's own sendMediaMessage. See provider-dispatch.ts for where
 *  templates/interactive are still rejected before reaching here —
 *  QR has no equivalent to a Meta-approved template. */
export async function sendQrMediaMessage(args: {
  accountId: string;
  to: string;
  kind: 'image' | 'video' | 'audio' | 'document';
  link: string;
  caption?: string;
  filename?: string;
}): Promise<{ messageId: string }> {
  const data = await gatewayFetch('/send-media', {
    method: 'POST',
    body: JSON.stringify(args),
  });
  return { messageId: data.messageId };
}
