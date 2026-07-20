import type { Metadata } from "next";
import type { ReactNode } from "react";

// Force all auth pages (login / signup / forgot-password) to be dynamically
// rendered at request time. Without this, Next.js attempts to statically
// prerender them during `next build`, which triggers createBrowserClient()
// validation before the Supabase env vars are available in the build context.
export const dynamic = "force-dynamic";

// Shared metadata for auth pages (login / signup / forgot-password).
// None of these should be indexed — they'd compete with the marketing
// landing in SERPs and offer nothing to a searcher who hasn't already
// signed up. Each page still gets its own <title> via its own
// metadata.title override below the route group layout.
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return children;
}
