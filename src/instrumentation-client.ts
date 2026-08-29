// Browser-side Sentry init — Next.js auto-loads this file (no manual
// import needed) as of the instrumentation-client convention. Set
// NEXT_PUBLIC_SENTRY_DSN to enable; no-ops without it, same as the
// server/edge configs (see sentry.server.config.ts).

import * as Sentry from "@sentry/nextjs";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    environment: process.env.NODE_ENV,
    // Session replay is off — this app renders patient data (names,
    // phone numbers, clinical notes); recording sessions would send
    // that to a third party by default, which needs an explicit
    // privacy decision this project hasn't made yet, not a default-on
    // integration.

    // `app://` frames are scripts injected by the native shell hosting
    // the page — Instagram/Facebook's in-app browser bridge, on both
    // iOS (sendDataToNative/sendPageHideMessage throwing on a missing
    // window.webkit.messageHandlers entry) and Android (their
    // navigation_performance_logger_android script throwing "Java
    // object is gone" when the WebView tears down its JS-to-Java
    // bridge mid-navigation). Never our own bundle, never fixable from
    // here — the injected script runs before our code and calls a
    // native handler that may or may not exist depending on the host
    // app's version. The message-text entries below are a fallback for
    // when a frame's URL doesn't get picked up by denyUrls.
    denyUrls: [/^app:\/\//],
    ignoreErrors: ["window.webkit.messageHandlers", "Java object is gone"],
  });
}

// Lets Sentry trace App Router client-side navigations as their own
// transactions instead of only seeing the initial page load.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
