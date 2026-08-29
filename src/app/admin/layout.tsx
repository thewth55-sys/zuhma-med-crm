import { redirect } from "next/navigation";

import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/account";
import { AdminShell } from "@/components/admin/admin-shell";

// Server-side gate for the whole /admin surface — mirrors the
// UnauthorizedError/ForbiddenError split requirePlatformAdmin()
// throws: no session at all sends the visitor to /login, a real
// session that just isn't platform staff sends them back to their
// own dashboard rather than a bare 403 page.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  try {
    await requirePlatformAdmin();
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/login");
    if (err instanceof ForbiddenError) redirect("/dashboard");
    throw err;
  }

  return <AdminShell>{children}</AdminShell>;
}
