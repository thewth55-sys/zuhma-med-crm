import { redirect } from "next/navigation";

// Zuhma Med CRM has no public marketing landing — it's offered
// directly to Zuhma's own clients, not sold self-serve. `/` just
// sends every visitor to /login; middleware already redirects an
// already-authenticated user from /login straight to /dashboard, so
// this composes correctly for both signed-in and signed-out visitors.
export default function RootPage() {
  redirect("/login");
}
