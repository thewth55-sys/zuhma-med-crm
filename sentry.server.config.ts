import * as Sentry from "@sentry/nextjs";

// No-ops (returns without initializing) when SENTRY_DSN isn't set, so
// the app runs identically with zero Sentry configuration — this
// isn't required to deploy, only to get error alerting once a DSN is
// added. Get a DSN by creating a free project at sentry.io (Platform:
// Next.js) and pasting its DSN into this env var.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    // 10% of transactions traced — enough to catch real performance
    // patterns without paying to trace every single request on a
    // multi-tenant CRM with a lot of background polling.
    tracesSampleRate: 0.1,
    environment: process.env.NODE_ENV,
  });
}
