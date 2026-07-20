import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";
import { version as appVersion } from "./package.json";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * Baseline security headers applied to every response.
 *
 * CSP is enforced (not report-only) as of the production-readiness
 * pass — audited every client-side external resource in the app
 * first (no <iframe>, no client fetch() to external hosts, only the
 * theme-boot <Script> tag — and Stripe Checkout/Portal are plain
 * server-issued redirect URLs the browser navigates to, not an
 * embedded Stripe.js/iframe, so they need nothing here). If a future
 * integration trips this, the fix is
 * either adding its host to the relevant directive below, or (for
 * something to test broadly before enforcing) temporarily switching
 * the header key back to `Content-Security-Policy-Report-Only`.
 *
 * The rest of the headers are straight blocks, safe to enforce today:
 *   - HSTS: only meaningful on HTTPS (no-op on http://localhost).
 *   - X-Content-Type-Options / X-Frame-Options / Referrer-Policy:
 *     baseline OWASP hardening, no behavioural cost.
 *   - Permissions-Policy: we don't use camera / microphone / etc, so
 *     deny them. A supply-chain compromise or a forgotten plugin
 *     can't silently opt back in.
 */
const SECURITY_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    // Microphone is allowed for same-origin (`self`) so the inbox
    // composer can record voice notes via MediaRecorder. Everything
    // else stays denied — a compromised dependency can't silently grab
    // the camera / geolocation / etc.
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js needs 'unsafe-inline' for its inline hydration script
      // and 'unsafe-eval' in dev + some production optimisations.
      // Nonce-based CSP is a later project.
      // googletagmanager.com is gtag.js — lazy-loaded only when an
      // account configures Google Ads conversion tracking (see
      // src/lib/conversions/gtag.ts), never loaded unconditionally.
      // challenges.cloudflare.com is the Turnstile login CAPTCHA
      // (src/components/auth/turnstile-widget.tsx) — only loads when
      // NEXT_PUBLIC_TURNSTILE_SITE_KEY is configured. connect.facebook.net
      // is Meta's JS SDK, loaded only on Settings → WhatsApp when
      // NEXT_PUBLIC_META_APP_ID is set (WhatsApp Embedded Signup —
      // see whatsapp-embedded-signup-button.tsx).
      // unpkg.com serves the Lucide icon UMD bundle used by the
      // public marketing landing (src/app/page.tsx), which renders
      // outside the app's normal lucide-react import graph.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://challenges.cloudflare.com https://connect.facebook.net https://unpkg.com",
      // Tailwind + inline style attributes on lots of components.
      // fonts.googleapis.com serves the landing page's Google Fonts
      // stylesheet (Manrope / JetBrains Mono).
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // Supabase public-bucket avatars, contact avatars (arbitrary
      // https URLs paste-able from the UI), OG images, data URLs for
      // tiny inline assets.
      "img-src 'self' data: blob: https:",
      // Outbound media previews (blob: from MediaRecorder + file picker)
      // and Supabase public-bucket audio/video the inbox renders.
      "media-src 'self' blob: https://*.supabase.co",
      // fonts.gstatic.com serves the actual Manrope/JetBrains Mono
      // font files referenced by the landing page's Google Fonts CSS.
      "font-src 'self' data: https://fonts.gstatic.com",
      // Supabase REST + realtime (WSS). All Graph API calls (sending
      // messages, registering numbers, etc.) happen server-side, so
      // graph.facebook.com does not belong here — connect.facebook.net
      // / www.facebook.com below are only the JS SDK's own bootstrap
      // and login-status calls for Embedded Signup.
      // googletagmanager.com / google.com / doubleclick.net are the
      // Google Ads gtag conversion beacon (client-side, opt-in per
      // account — see src/lib/conversions/gtag.ts). *.sentry.io /
      // *.ingest.*.sentry.io is where the browser SDK (see
      // src/instrumentation-client.ts) reports errors — only active
      // once NEXT_PUBLIC_SENTRY_DSN is set, but allowlisted
      // unconditionally so turning it on later doesn't also require
      // remembering to touch the CSP.
      // ipwho.is / open.er-api.com back the /pricing page's
      // local-currency estimate (src/lib/currency/geo-estimate.ts) —
      // client-side, best-effort, display-only (billing always stays
      // USD via Stripe).
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://www.googletagmanager.com https://www.google.com https://googleads.g.doubleclick.net https://challenges.cloudflare.com https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io https://connect.facebook.net https://www.facebook.com https://graph.facebook.com https://ipwho.is https://open.er-api.com",
      // Turnstile renders its interactive challenge inside an iframe
      // from this origin when it can't pass invisibly; WhatsApp
      // Embedded Signup opens Meta's popup as a real window, not an
      // iframe, but the JS SDK itself loads a small hidden iframe
      // from facebook.com for login-status tracking.
      "frame-src https://challenges.cloudflare.com https://www.facebook.com https://web.facebook.com",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
] as const;

const nextConfig: NextConfig = {
  output: "standalone",
  // Surfaced in the sidebar footer so support can tell at a glance
  // which build a client is running.
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
  /**
   * Skips the "Running TypeScript ..." check inside `next build`
   * (Next 16 no longer runs ESLint during build at all — this log
   * never showed a lint step, only the TS one — so there's nothing
   * to disable there). Safe ONLY because this project's actual
   * workflow always runs `npx tsc --noEmit` and `npx eslint` locally
   * as a hard gate before every push (every batch of work this
   * session went through that exact ritual before committing) —
   * re-running the type check again on this memory-constrained VPS
   * is redundant work, and it was the build's OOM/hang point three
   * deploys in a row even after capping worker parallelism
   * (experimental.cpus above) and disabling webpack's persistent
   * cache (below). User-authorized trade-off: if a change is ever
   * pushed WITHOUT running the local checks first, a real type error
   * could reach production unnoticed. Revisit if/when this deploys
   * from a bigger box.
   */
  typescript: { ignoreBuildErrors: true },
  experimental: {
    /**
     * Caps the number of parallel build workers — used by webpack
     * compile, the (now-skipped) type-check step, AND "Collecting
     * page data", which is where the build hung next even at cpus:2.
     * Next's default is `os.cpus().length - 1`, which on this build
     * host reads the HOST's core count, not this container's actual
     * memory allotment, so the default (and even 2) can spawn more
     * parallel workers than the VPS's 4GB total can hold at once
     * (each worker gets its own heap, on top of webpack's own
     * process) — same "off-heap + V8 heap together exceed container
     * memory" shape as the earlier Sentry-sourcemap OOM (see the
     * sourcemaps.disable comment below). Forcing fully serial (1)
     * trades the most build speed for the most headroom; combined
     * with the raised NODE_BUILD_MEMORY_MB below, the single worker
     * also gets more heap to itself since it's no longer contending
     * with a SIBLING worker. It still runs alongside its PARENT
     * `next build` process though, which stays resident the whole
     * time — see the Dockerfile's NODE_BUILD_MEMORY_MB comment for
     * why that distinction matters and how the cap is sized for it.
     */
    cpus: 1,
  },
  webpack: (config, { dev }) => {
    if (!dev) {
      // Webpack 5's persistent filesystem cache serializes the whole
      // compilation graph to disk after every build, to speed up the
      // *next* build. In this Docker build every deploy is a fresh
      // checkout with nothing to reuse, and the cache directory never
      // makes it into the final image anyway (only .next/standalone +
      // .next/static get copied — see the Dockerfile), so the write
      // is 100% wasted work. It's also the single most memory-hungry
      // moment of an already-constrained build: the deploy that
      // exposed this failed with no further output right after
      // "Serializing big strings (250kiB) ..." — the same silent-OOM
      // signature as the earlier Sentry-sourcemap and worker-count
      // issues (see those comments above/below). Disabling the cache
      // removes that cost entirely instead of trying to out-budget it.
      config.cache = false;
    }
    return config;
  },
  /**
   * Cache-Control policy.
   *
   * Why this exists:
   *   Hostinger's CDN was applying `s-maxage=31536000` (1 year) to
   *   prerendered HTML pages by default. When a new deploy shipped
   *   fresh Turbopack chunk hashes, the edge kept serving year-old
   *   HTML referencing chunk filenames that no longer existed on
   *   disk — result: HTML 200, every /_next/static/*.js and .css
   *   came back 404, the page rendered unstyled. Private/incognito
   *   did nothing because the cache is server-side.
   *
   * Strategy:
   *   - /_next/static/* — leave to Next. Turbopack dev chunks can go
   *     stale if we force immutable caching here; Next already emits
   *     the correct production headers for hashed assets.
   *   - /api/*          — no-store. API responses are per-user and
   *     must never be shared across requests at the edge.
   *   - Everything else — public, brief s-maxage + generous
   *     stale-while-revalidate. The edge serves instantly from cache
   *     for the first 5 min, then returns cached content while
   *     refreshing in the background for up to 24 h. A deploy's
   *     chunk-hash drift self-heals within ~5 min with no user-
   *     visible latency.
   *
   *   Note: dynamic dashboard routes (/inbox, /contacts, /pipelines,
   *   /broadcasts, etc.) are server-rendered per request — Next.js
   *   and Supabase auth already prevent them from being served
   *   from a shared cache. The s-maxage here is a ceiling; Next.js
   *   and auth middleware still set `private` / `no-store` for
   *   per-user responses.
   *
   * Security headers are appended via a separate catch-all rule
   * below — Next.js merges headers from every matching rule, so
   * they apply to every response regardless of which cache rule
   * matched.
   */
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source: "/:path((?!_next/static|_next/image|api).*)",
        headers: [
          {
            key: "Cache-Control",
            value:
              "public, max-age=0, s-maxage=300, stale-while-revalidate=86400",
          },
        ],
      },
      {
        // Security headers on every response, including /_next/static
        // assets (nosniff matters there) and /api/* (HSTS + referrer-
        // policy don't hurt).
        source: "/:path*",
        headers: [...SECURITY_HEADERS],
      },
    ];
  },
};

export default withSentryConfig(withNextIntl(nextConfig), {
  // Only matters for source-map upload (readable stack traces in the
  // Sentry UI) — silently no-ops during `next build` when
  // SENTRY_AUTH_TOKEN isn't set, so this is safe with zero Sentry
  // configuration. Get an auth token + confirm org/project slugs from
  // sentry.io → Settings → Auth Tokens once a project exists.
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // This VPS's build container is memory-constrained enough that even
  // WITHOUT an auth token (upload skipped), the plugin's source-map
  // *generation* work alone was enough added memory pressure to get
  // the build SIGKILLed — raising --max-old-space-size twice did not
  // fix it, which points at total container memory (off-heap + V8
  // heap together), not just V8's own heap ceiling. Explicitly
  // disabling sourcemap generation removes that work entirely rather
  // than relying on authToken's absence to (apparently insufficiently)
  // skip it. Costs unminified stack traces in the Sentry UI; revisit
  // once this host's actual memory ceiling is known, or once builds
  // move to a less constrained box.
  sourcemaps: { disable: true },
  // Avoids proxying Sentry's own telemetry ingest through this app's
  // own domain — no ad-blocker-evasion tunnel needed for an internal
  // clinic CRM, and it would add a permanent extra route.
  tunnelRoute: false,
  webpack: {
    treeshake: { removeDebugLogging: true },
  },
});
