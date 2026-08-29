/**
 * Best-effort IP → country lookup for the admin "Sesiones recientes"
 * card. Uses ip-api.com's free, unauthenticated endpoint — approved
 * explicitly by the user (2026-07-15) knowing it means every login's
 * IP is sent to that third party over plain HTTP (their free tier
 * has no HTTPS). Never throws — a slow or down provider just means
 * `country` stays null on that login row; it must never block or
 * fail the sign-in flow that triggers it.
 */
export async function lookupCountry(ip: string): Promise<string | null> {
  if (!ip || ip === "unknown" || isPrivateIp(ip)) return null;
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.status === "success" ? (data.country ?? null) : null;
  } catch {
    return null;
  }
}

function isPrivateIp(ip: string): boolean {
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  );
}
