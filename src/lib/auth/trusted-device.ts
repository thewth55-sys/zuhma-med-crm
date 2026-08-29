import crypto from "crypto";

/**
 * "Recordar este dispositivo" — cookie opaca (token aleatorio) cuyo
 * SHA-256 se guarda en `trusted_devices`. Mientras la cookie exista y su
 * hash siga vigente en la tabla, el login se salta el 2FA. No requiere
 * firma HMAC: la validez la da la existencia del hash en la BD.
 */
export const TRUSTED_DEVICE_COOKIE = "zuhma_td";
export const TRUSTED_DEVICE_TTL_DAYS = 60;

export function newTrustedDeviceToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashTrustedDeviceToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function trustedDeviceExpiryFromNow(): Date {
  return new Date(Date.now() + TRUSTED_DEVICE_TTL_DAYS * 86_400_000);
}
