/**
 * Minimal browser/device parse for the admin "Sesiones recientes"
 * display — not authoritative, just enough to tell a support agent
 * "Chrome on a Mac" vs "Safari on an iPhone" apart. Deliberately no
 * `ua-parser-js` dependency for something this bounded; order of the
 * checks matters (Edge/Opera UAs also match "Chrome", so they're
 * checked first).
 */
export function parseBrowser(userAgent: string | null): string | null {
  if (!userAgent) return null;
  if (/edg\//i.test(userAgent)) return "Edge";
  if (/opr\/|opera/i.test(userAgent)) return "Opera";
  if (/chrome\//i.test(userAgent)) return "Chrome";
  if (/firefox\//i.test(userAgent)) return "Firefox";
  if (/safari\//i.test(userAgent)) return "Safari";
  return "Otro";
}

export function parseDevice(userAgent: string | null): string | null {
  if (!userAgent) return null;
  if (/ipad|tablet/i.test(userAgent)) return "Tablet";
  if (/mobile|iphone|android/i.test(userAgent)) return "Móvil";
  return "Escritorio";
}
