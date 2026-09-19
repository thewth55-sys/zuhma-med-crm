import { redirect } from "next/navigation";
import { requireStaffRole } from "@/lib/auth/platform-admin";
import { ForbiddenError } from "@/lib/auth/account";

import { AdminMarketingAccountsList } from "@/components/admin/admin-marketing-accounts-list";

export default async function AdminMarketingPage() {
  try {
    await requireStaffRole(["marketing"]);
  } catch (err) {
    if (err instanceof ForbiddenError) redirect("/admin");
    throw err;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Marketing</h1>
        <p className="text-sm text-muted-foreground">
          Entra directo al panel de contenido de cualquier cuenta, sin escribir la URL a mano.
        </p>
      </div>
      <AdminMarketingAccountsList />
    </div>
  );
}
