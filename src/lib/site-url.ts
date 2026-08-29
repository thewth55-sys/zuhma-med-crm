// ============================================================
// Shared "what's our public URL" resolver for server-side redirect
// targets. NEXT_PUBLIC_SITE_URL first, then proxy headers, then bare
// Host — never `new URL(request.url).origin`, which behind
// Easypanel's proxy resolved to the container's internal bind
// address (0.0.0.0:80) instead of the public domain (see
// /auth/callback's fix). Same resolution order as getBaseUrl() in
// /api/account/invitations/route.ts.
// ============================================================

export function getBaseUrl(request: Request): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedHost) {
    return `${forwardedProto || "https"}://${forwardedHost}`;
  }

  const host = request.headers.get("host")?.trim();
  if (host) {
    const reqProto = new URL(request.url).protocol.replace(":", "");
    return `${reqProto}://${host}`;
  }

  return "https://app.zuhma.com";
}
