import * as Sentry from "@sentry/nextjs";

// Covers src/middleware.ts (edge runtime) — see sentry.server.config.ts
// for why this no-ops without a DSN.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    environment: process.env.NODE_ENV,
  });
}
