import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidGroup,
  isJidBroadcast,
  isJidStatusBroadcast,
  isLidUser,
  jidNormalizedUser,
  type WASocket,
  type WAMessage,
} from 'baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import QRCode from 'qrcode';
import { loadSupabaseAuthState } from './auth-state.js';
import { supabaseAdmin } from './supabase.js';
import { notifyInboundMessage } from './webhook-client.js';
import { downloadAndStoreInboundMedia } from './media.js';

// One entry per account with an active (or connecting) socket. Accounts
// with no entry here are simply disconnected — the row in
// whatsapp_config.qr_connection_state is the durable source of truth;
// this map is just which sockets are live IN THIS PROCESS right now.
const sessions = new Map<string, WASocket>();

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

// QR codes expire ~60s in practice; give a little slack for clock skew
// between this process and whatever reads qr_code_expires_at.
const QR_EXPIRY_MS = 60_000;

function toWhatsAppJid(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  return `${digits}@s.whatsapp.net`;
}

async function updateConfigRow(accountId: string, fields: Record<string, unknown>): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('whatsapp_config')
    .update(fields)
    .eq('account_id', accountId)
    .eq('provider', 'qr');
  if (error) {
    logger.error({ accountId, error: error.message }, 'failed to update whatsapp_config row');
  }
}

async function configRowExists(accountId: string): Promise<boolean> {
  const { data } = await supabaseAdmin()
    .from('whatsapp_config')
    .select('id')
    .eq('account_id', accountId)
    .eq('provider', 'qr')
    .maybeSingle();
  return !!data;
}

export function isSessionActive(accountId: string): boolean {
  return sessions.has(accountId);
}

/** Starts (or restarts) a Baileys session for an account. Requires a
 *  `whatsapp_config` row with provider='qr' to already exist — that row
 *  is created by the monolith's qr/accept-risk endpoint, which is where
 *  the mandatory risk acknowledgment is recorded (see migration 115's
 *  qr_risk_accepted_at CHECK). This function never creates that row
 *  itself, so a connect attempt for an account that never accepted the
 *  risk disclosure fails loudly instead of silently starting a session
 *  nothing consented to. */
export async function connectSession(accountId: string): Promise<void> {
  const existingSocket = sessions.get(accountId);
  if (existingSocket) {
    // Already connecting/connected — treat as a no-op rather than
    // stacking a second socket for the same account.
    return;
  }

  if (!(await configRowExists(accountId))) {
    throw new Error(`No qr whatsapp_config row for account ${accountId} — accept the risk disclosure first`);
  }

  const { state, saveCreds } = await loadSupabaseAuthState(accountId, logger);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    auth: state,
    logger,
    version,
    browser: Browsers.ubuntu('Chrome'),
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  sessions.set(accountId, sock);
  await updateConfigRow(accountId, { qr_connection_state: 'awaiting_scan' });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    void handleConnectionUpdate(accountId, sock, update);
  });

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      void handleInboundMessage(accountId, sock, msg);
    }
  });
}

async function handleConnectionUpdate(
  accountId: string,
  sock: WASocket,
  update: Partial<{
    connection: 'open' | 'connecting' | 'close';
    lastDisconnect?: { error: Error | undefined; date: Date };
    qr?: string;
  }>
): Promise<void> {
  const { connection, lastDisconnect, qr } = update;

  if (qr) {
    try {
      const qrDataUrl = await QRCode.toDataURL(qr);
      await updateConfigRow(accountId, {
        qr_current_code: qrDataUrl,
        qr_code_expires_at: new Date(Date.now() + QR_EXPIRY_MS).toISOString(),
        qr_connection_state: 'awaiting_scan',
      });
    } catch (err) {
      logger.error({ accountId, err }, 'failed to render/persist QR code');
    }
  }

  if (connection === 'open') {
    const connectedPhone = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
    await updateConfigRow(accountId, {
      qr_connection_state: 'connected',
      qr_current_code: null,
      qr_code_expires_at: null,
      qr_connected_phone: connectedPhone,
      qr_last_disconnect_reason: null,
    });
    logger.info({ accountId, connectedPhone }, 'qr session connected');
  }

  if (connection === 'close') {
    sessions.delete(accountId);
    const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
    const reason = lastDisconnect?.error?.message ?? `status ${statusCode ?? 'unknown'}`;

    if (statusCode === DisconnectReason.loggedOut) {
      await updateConfigRow(accountId, {
        qr_connection_state: 'logged_out',
        qr_current_code: null,
        qr_code_expires_at: null,
        qr_auth_state: null,
        qr_last_disconnect_reason: reason,
      });
      logger.info({ accountId }, 'qr session logged out — not reconnecting');
      return;
    }

    await updateConfigRow(accountId, {
      qr_connection_state: 'disconnected',
      qr_last_disconnect_reason: reason,
    });
    logger.warn({ accountId, reason }, 'qr session dropped — reconnecting');
    // Any other close (connectionClosed, connectionLost, restartRequired,
    // timedOut, etc.) is transient from Baileys' own perspective — same
    // policy Baileys' own docs recommend: reconnect unless logged out.
    void connectSession(accountId).catch((err) =>
      logger.error({ accountId, err }, 'reconnect attempt failed')
    );
  }
}

async function handleInboundMessage(accountId: string, sock: WASocket, msg: WAMessage): Promise<void> {
  if (msg.key.fromMe) return;
  let remoteJid = msg.key.remoteJid;
  if (!remoteJid || isJidGroup(remoteJid) || isJidBroadcast(remoteJid) || isJidStatusBroadcast(remoteJid)) {
    // Phase 1 is 1:1 text only — group/broadcast/status messages are
    // silently ignored rather than misfiled into a contact's DM thread.
    return;
  }

  // WhatsApp increasingly addresses contacts by LID (a privacy identifier,
  // e.g. "123456@lid") instead of their real phone-number JID
  // ("<phone>@s.whatsapp.net") — confirmed in production logs. A LID's
  // numeric part is NOT a phone number; storing it as one silently breaks
  // every future reply (the contact gets a phone that resolves to no real
  // WhatsApp chat, so sends "succeed" but never arrive). Resolve to the
  // real phone-number JID via Baileys' own LID<->PN store before using it.
  if (isLidUser(remoteJid)) {
    try {
      const pn = await sock.signalRepository.lidMapping.getPNForLID(remoteJid);
      if (pn) {
        remoteJid = pn;
      } else {
        logger.warn({ accountId, lid: remoteJid }, 'no phone-number mapping for inbound LID yet — contact will be misfiled under the LID');
      }
    } catch (err) {
      logger.error({ accountId, lid: remoteJid, err }, 'LID->PN resolution failed');
    }
  }

  const text =
    msg.message?.conversation ??
    msg.message?.extendedTextMessage?.text ??
    null;

  const senderPhone = jidNormalizedUser(remoteJid).replace('@s.whatsapp.net', '');
  const timestamp = typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp * 1000 : Date.now();
  const common = {
    accountId,
    whatsappSessionId: remoteJid,
    externalMessageId: msg.key.id ?? '',
    senderPhone,
    contactName: msg.pushName ?? undefined,
    timestamp,
  };

  if (text) {
    await notifyInboundMessage({ ...common, contentType: 'text', contentText: text, mediaUrl: null });
    return;
  }

  const media = await downloadAndStoreInboundMedia(sock, msg, accountId, logger);
  if (!media) {
    // Not a supported media type (interactive reply, poll vote, reaction
    // handled elsewhere, etc.) or the download/upload failed — already
    // logged inside downloadAndStoreInboundMedia for the failure case.
    return;
  }

  await notifyInboundMessage({
    ...common,
    contentType: media.kind,
    contentText: media.caption,
    // The monolith resolves this to a short-lived signed URL on each
    // authenticated request — see src/app/api/whatsapp/qr-media/.
    mediaUrl: `/api/whatsapp/qr-media/${media.storagePath}`,
  });
}

export async function sendText(accountId: string, to: string, text: string): Promise<{ messageId: string }> {
  const sock = sessions.get(accountId);
  if (!sock) {
    throw new Error(`No active qr session for account ${accountId}`);
  }
  const jid = toWhatsAppJid(to);
  const result = await sock.sendMessage(jid, { text });
  if (!result?.key.id) {
    throw new Error('wa-qr-gateway: sendMessage returned no message id');
  }
  return { messageId: result.key.id };
}

export type OutboundMediaKind = 'image' | 'video' | 'audio' | 'document';

/**
 * Sends a remote-hosted attachment. Mirrors the Meta Cloud API's own
 * "just give me a link" model (src/lib/whatsapp/meta-api.ts's
 * sendMediaMessage) — Baileys fetches `link` itself, re-uploads it
 * (encrypted) to WhatsApp's media servers, and infers the Content-Type
 * from that fetch when we don't pass an explicit mimetype, same as the
 * Meta path relies on. `filename`/`caption` only apply to `document`
 * and `image`/`video` respectively — Meta itself rejects a caption on
 * audio (see that same file's comment), so this mirrors that instead
 * of silently sending something WhatsApp would drop anyway.
 */
export async function sendMedia(
  accountId: string,
  to: string,
  kind: OutboundMediaKind,
  link: string,
  caption?: string,
  filename?: string
): Promise<{ messageId: string }> {
  const sock = sessions.get(accountId);
  if (!sock) {
    throw new Error(`No active qr session for account ${accountId}`);
  }
  const jid = toWhatsAppJid(to);

  const content =
    kind === 'image'
      ? { image: { url: link }, caption }
      : kind === 'video'
        ? { video: { url: link }, caption }
        : kind === 'audio'
          ? { audio: { url: link } }
          : { document: { url: link }, mimetype: 'application/octet-stream', fileName: filename };

  const result = await sock.sendMessage(jid, content);
  if (!result?.key.id) {
    throw new Error('wa-qr-gateway: sendMessage returned no message id');
  }
  return { messageId: result.key.id };
}

export async function disconnectSession(accountId: string): Promise<void> {
  const sock = sessions.get(accountId);
  sessions.delete(accountId);
  if (sock) {
    try {
      await sock.logout();
    } catch (err) {
      logger.warn({ accountId, err }, 'logout() threw — clearing local state anyway');
    }
  }
  await updateConfigRow(accountId, {
    qr_connection_state: 'logged_out',
    qr_current_code: null,
    qr_code_expires_at: null,
    qr_auth_state: null,
    qr_connected_phone: null,
  });
}

/** Called once at process boot. Sessions that were connected (or
 *  mid-pairing) when the container last stopped won't resume on their
 *  own — Baileys only reconnects sockets that exist in THIS process's
 *  memory. Without this, any redeploy or crash silently drops every
 *  client's QR line until someone notices and reconnects manually. */
export async function restoreSessionsOnBoot(): Promise<void> {
  const { data, error } = await supabaseAdmin()
    .from('whatsapp_config')
    .select('account_id')
    .eq('provider', 'qr')
    .in('qr_connection_state', ['connected', 'awaiting_scan']);

  if (error) {
    logger.error({ error: error.message }, 'failed to list sessions to restore on boot');
    return;
  }

  for (const row of data ?? []) {
    const accountId = (row as { account_id: string }).account_id;
    logger.info({ accountId }, 'restoring qr session on boot');
    await connectSession(accountId).catch((err) =>
      logger.error({ accountId, err }, 'failed to restore session on boot')
    );
  }
}
