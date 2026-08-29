import crypto from "crypto";

// ============================================================
// Códigos de activación de cuenta.
//
// El dueño de una cuenta nueva recibe un CÓDIGO (no un link) que teclea
// en /activar. A diferencia de un link de un solo uso, un código no lo
// consume un escáner de correo, así que evita el problema de
// `otp_expired`. Solo se guarda el hash; el código en claro únicamente
// existe en el correo que se le envía al cliente.
// ============================================================

// Sin caracteres ambiguos (0/O, 1/I/L) para que sea fácil de teclear.
const CODE_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const ACTIVATION_CODE_LENGTH = 8;
export const ACTIVATION_CODE_TTL_DAYS = 7;

/** Versión de los T&C vigentes; súbela cuando cambie el documento legal. */
export const TERMS_VERSION = "2026-07-22";

export function generateActivationCode(): string {
  const bytes = crypto.randomBytes(ACTIVATION_CODE_LENGTH);
  let out = "";
  for (let i = 0; i < ACTIVATION_CODE_LENGTH; i++) {
    out += CODE_CHARSET[bytes[i] % CODE_CHARSET.length];
  }
  return out;
}

/**
 * Normaliza (mayúsculas, sin espacios) antes de hashear, para que el
 * usuario pueda teclear en minúsculas o con espacios y siga coincidiendo.
 * El hash SHA-256 es lo único que se compara y se almacena.
 */
export function hashActivationCode(code: string): string {
  const normalized = code.trim().toUpperCase().replace(/\s+/g, "");
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/** ISO timestamp de expiración a partir de ahora. */
export function activationCodeExpiryFromNow(): string {
  return new Date(Date.now() + ACTIVATION_CODE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}
