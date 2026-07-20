// Next.js instrumentation hook — loads the right Sentry config for
// whichever runtime this process is (Node.js server vs. edge
// middleware), and wires Next's own request-error hook into Sentry so
// errors thrown in Server Components / Route Handlers get captured
// even outside a try/catch.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export async function onRequestError(
  ...args: Parameters<typeof import("@sentry/nextjs").captureRequestError>
) {
  const { captureRequestError } = await import("@sentry/nextjs");
  captureRequestError(...args);
}
