import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import {
  connectSession,
  disconnectSession,
  restoreSessionsOnBoot,
  sendText,
  sendMedia,
  type OutboundMediaKind,
} from './sessions.js';

const app = express();
app.use(express.json());

// Same shared-secret pattern as the monolith's x-cron-secret
// (src/lib/cron/verify-secret.ts) — timing-safe so a partial-match
// doesn't leak how many characters were right via response latency.
function timingSafeSecretEqual(supplied: string | undefined, expected: string): boolean {
  if (!supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

app.use((req, res, next) => {
  if (req.path === '/health') return next();
  const secret = process.env.WA_QR_GATEWAY_SECRET;
  if (!secret) {
    res.status(503).json({ error: 'WA_QR_GATEWAY_SECRET not configured' });
    return;
  }
  if (!timingSafeSecretEqual(req.header('x-qr-gateway-secret'), secret)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/connect', async (req, res) => {
  const accountId = req.body?.accountId;
  if (!accountId || typeof accountId !== 'string') {
    res.status(400).json({ error: 'accountId is required' });
    return;
  }
  try {
    await connectSession(accountId);
    res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    res.status(400).json({ error: message });
  }
});

app.post('/disconnect', async (req, res) => {
  const accountId = req.body?.accountId;
  if (!accountId || typeof accountId !== 'string') {
    res.status(400).json({ error: 'accountId is required' });
    return;
  }
  try {
    await disconnectSession(accountId);
    res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    res.status(500).json({ error: message });
  }
});

app.post('/send', async (req, res) => {
  const { accountId, to, text } = req.body ?? {};
  if (!accountId || !to || !text) {
    res.status(400).json({ error: 'accountId, to, and text are required' });
    return;
  }
  try {
    const result = await sendText(accountId, to, text);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    res.status(502).json({ error: message });
  }
});

const MEDIA_KINDS: OutboundMediaKind[] = ['image', 'video', 'audio', 'document'];

app.post('/send-media', async (req, res) => {
  const { accountId, to, kind, link, caption, filename } = req.body ?? {};
  if (!accountId || !to || !link || !MEDIA_KINDS.includes(kind)) {
    res.status(400).json({ error: 'accountId, to, link, and a valid kind are required' });
    return;
  }
  try {
    const result = await sendMedia(accountId, to, kind, link, caption, filename);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    res.status(502).json({ error: message });
  }
});

const port = Number(process.env.PORT ?? 3100);
app.listen(port, () => {
  console.log(`wa-qr-gateway listening on :${port}`);
});

restoreSessionsOnBoot().catch((err) => {
  console.error('failed to restore sessions on boot:', err);
});
