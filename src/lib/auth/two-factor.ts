import crypto from "crypto";

/**
 * 2FA por código al correo (dispositivos nuevos). El código nunca se
 * guarda en claro: se almacena su SHA-256 y se compara por hash.
 */
export const TWO_FA_CODE_LENGTH = 6;
export const TWO_FA_TTL_MINUTES = 10;
export const TWO_FA_MAX_ATTEMPTS = 5;

/** Código numérico de 6 dígitos, cripto-fuerte, con ceros a la izquierda. */
export function generate2faCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(TWO_FA_CODE_LENGTH, "0");
}

export function hash2faCode(code: string): string {
  return crypto.createHash("sha256").update(code.trim()).digest("hex");
}

export function twoFaExpiryFromNow(): string {
  return new Date(Date.now() + TWO_FA_TTL_MINUTES * 60_000).toISOString();
}
