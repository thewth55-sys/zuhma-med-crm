// Minimal mimetype<->extension mapping — enough for what WhatsApp
// actually sends/accepts, no need to pull in a full `mime-types`
// dependency for this. Used only for naming stored objects; the actual
// Content-Type served back to the browser always comes from what we
// pass as `contentType` at upload time (the real mimetype Baileys gave
// us), not from a reverse lookup off the extension.

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'application/pdf': 'pdf',
};

/** Baileys reports audio mimetypes with a codec parameter almost
 *  always, e.g. "audio/ogg; codecs=opus" — the qr-inbound-media
 *  bucket's `allowed_mime_types` (migration 117) only lists the bare
 *  "audio/ogg", and Supabase Storage matches that exactly, so passing
 *  the raw value through as the upload's Content-Type gets every
 *  voice note rejected while images (whose mimetypes never carry a
 *  parameter) upload fine. Strip it before using the mimetype ANYWHERE
 *  downstream — both for the extension lookup and for the upload's
 *  own `contentType` option. */
export function baseMimetype(mimetype: string | null | undefined): string {
  if (!mimetype) return 'application/octet-stream';
  return mimetype.split(';')[0].trim().toLowerCase();
}

export function extensionForMimetype(mimetype: string | null | undefined): string {
  return MIME_TO_EXT[baseMimetype(mimetype)] ?? 'bin';
}

/** The Baileys message-content key (from getContentType()) mapped to
 *  this app's `messages.content_type` values — mirrors how the Meta
 *  webhook treats stickers as images (see webhook/route.ts's
 *  processMessage comment: "stickers are images"). */
export type InboundMediaKind = 'image' | 'video' | 'audio' | 'document';

const CONTENT_TYPE_TO_KIND: Record<string, InboundMediaKind> = {
  imageMessage: 'image',
  stickerMessage: 'image',
  videoMessage: 'video',
  audioMessage: 'audio',
  documentMessage: 'document',
};

export function mediaKindForContentType(contentType: string | undefined): InboundMediaKind | null {
  if (!contentType) return null;
  return CONTENT_TYPE_TO_KIND[contentType] ?? null;
}
