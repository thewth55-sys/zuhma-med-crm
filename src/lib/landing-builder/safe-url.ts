/**
 * Validates a Puck-editor-supplied URL before it's ever rendered as
 * an `href`. `ctaHref`/`mapsUrl` are free-text fields an account
 * Admin can set (see editor-config.tsx) — a `javascript:` value would
 * execute in the browser of any visitor who clicks the link, and this
 * app's CSP allows `'unsafe-inline'`/`'unsafe-eval'` in script-src
 * (see next.config.ts), so CSP provides no backstop against it.
 *
 * Only http(s), tel, and mailto schemes are allowed; anything else
 * (javascript:, data:, vbscript:, …) is dropped. Scheme-less values
 * (relative paths, `#anchor`, `//host/path`) are passed through
 * unchanged — resolving against a dummy base just to read the
 * resulting protocol, without altering the original string.
 */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "tel:", "mailto:"]);

export function sanitizeHref(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;

  try {
    const resolved = new URL(trimmed, "https://zentro-med-landing.invalid/");
    if (!ALLOWED_PROTOCOLS.has(resolved.protocol)) return undefined;
    return trimmed;
  } catch {
    return undefined;
  }
}
