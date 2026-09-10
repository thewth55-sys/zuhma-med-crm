import crypto from 'node:crypto';

// Deliberately duplicated from src/lib/whatsapp/encryption.ts in the main
// app rather than imported — this is a separate Docker build context with
// its own package.json, and the two processes only need to agree on the
// wire format (AES-256-GCM, `<iv-hex>:<ciphertext-hex>:<authTag-hex>`) and
// the shared ENCRYPTION_KEY env var, not share code. Keep this in sync with
// the main app's version if that format ever changes.

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY!;
const GCM_IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(GCM_IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
}

export function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error(`Encrypted value has unrecognised format (expected 3 parts, got ${parts.length})`);
  }
  const [ivHex, ctHex, tagHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  if (iv.length !== GCM_IV_LENGTH) {
    throw new Error(`Encrypted value has unexpected GCM IV length ${iv.length}`);
  }
  const authTag = Buffer.from(tagHex, 'hex');
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(`Encrypted value has unexpected GCM auth-tag length ${authTag.length}`);
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ctHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
