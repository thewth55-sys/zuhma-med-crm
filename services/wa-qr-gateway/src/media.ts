import { downloadMediaMessage, getContentType, type WAMessage, type WASocket } from 'baileys';
import type { Logger } from 'pino';
import { supabaseAdmin } from './supabase.js';
import { baseMimetype, extensionForMimetype, mediaKindForContentType, type InboundMediaKind } from './mime.js';

export interface StoredInboundMedia {
  kind: InboundMediaKind;
  /** Object path within the qr-inbound-media bucket — the monolith's
   *  proxy route (src/app/api/whatsapp/qr-media/.../route.ts) turns
   *  this into a short-lived signed URL on each authenticated request,
   *  it's never served directly. */
  storagePath: string;
  mimetype: string;
  caption: string | null;
}

/**
 * Downloads + decrypts an inbound media message and persists it to the
 * qr-inbound-media bucket. Returns null (logging why) on anything that
 * isn't a supported media type, or on a download/upload failure — the
 * caller falls back to dropping the message rather than crashing the
 * whole inbound pipeline over one bad attachment.
 *
 * Why persist at all instead of proxying live like the Meta media route
 * does: WhatsApp's media URLs for a QR-connected session are per-message,
 * short-lived, and only decryptable with keys embedded in that specific
 * message object — there's no stable "mediaId" to re-fetch later the way
 * Meta's Graph API provides. This has to happen once, now, while we still
 * have the message and the live session.
 */
export async function downloadAndStoreInboundMedia(
  sock: WASocket,
  msg: WAMessage,
  accountId: string,
  logger: Logger
): Promise<StoredInboundMedia | null> {
  const contentTypeKey = getContentType(msg.message ?? undefined);
  const kind = mediaKindForContentType(contentTypeKey);
  if (!kind || !contentTypeKey) return null;

  const submessage = (msg.message as Record<string, { mimetype?: string; caption?: string } | undefined>)[
    contentTypeKey
  ];
  // Storage's `contentType` is what the browser eventually receives
  // back (via the signed URL), so the parameter-stripped form is what
  // we want everywhere from here on — not just for the extension.
  const mimetype = baseMimetype(submessage?.mimetype);
  const caption = submessage?.caption || null;

  let buffer: Buffer;
  try {
    buffer = await downloadMediaMessage(msg, 'buffer', {}, {
      reuploadRequest: sock.updateMediaMessage,
      logger,
    });
  } catch (err) {
    logger.error({ accountId, err }, 'failed to download inbound media from WhatsApp');
    return null;
  }

  const ext = extensionForMimetype(mimetype);
  const messageId = msg.key.id || `${Date.now()}`;
  const storagePath = `account-${accountId}/${messageId}.${ext}`;

  const { error } = await supabaseAdmin()
    .storage.from('qr-inbound-media')
    .upload(storagePath, buffer, { contentType: mimetype, upsert: true });

  if (error) {
    logger.error({ accountId, error: error.message }, 'failed to upload inbound media to storage');
    return null;
  }

  return { kind, storagePath, mimetype, caption };
}
