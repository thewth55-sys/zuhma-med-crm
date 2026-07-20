"use client";

// Next.js's last-resort error boundary — catches a render error that
// escapes every other error.tsx in the tree (including the root
// layout itself, which is why this has to render its own <html>/
// <body> instead of composing with layout.tsx). Reports to Sentry
// (no-ops without a DSN, same as everywhere else — see
// instrumentation-client.ts) so a crash here doesn't go unnoticed
// just because it's the rarest, worst kind of failure.

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          backgroundColor: "#fafafa",
          color: "#111827",
        }}
      >
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
            Algo salió mal
          </h1>
          <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 16 }}>
            Ocurrió un error inesperado. Ya fue reportado — intenta recargar la página.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              borderRadius: 8,
              backgroundColor: "#4ade5a",
              color: "#001f08",
              fontWeight: 700,
              fontSize: 14,
              padding: "10px 20px",
              border: "none",
              cursor: "pointer",
            }}
          >
            Recargar
          </button>
        </div>
      </body>
    </html>
  );
}
