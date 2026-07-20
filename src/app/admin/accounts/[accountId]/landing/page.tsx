import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { resolveAccountOwner } from "@/lib/auth/platform-admin";
import { AdminLandingEditor } from "@/components/admin/admin-landing-editor";

// Auth is enforced by the parent /admin layout (requirePlatformAdmin).
export default async function AdminAccountLandingPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const owner = await resolveAccountOwner(accountId);
  if (!owner) notFound();

  return (
    <div className="space-y-4">
      <Link
        href="/admin/accounts"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Cuentas
      </Link>
      <div>
        <h1 className="text-xl font-semibold text-foreground">Landing — {owner.accountName}</h1>
        <p className="text-sm text-muted-foreground">
          Editor de página completa (tier premium), para el equipo de diseño.
        </p>
      </div>
      <AdminLandingEditor accountId={accountId} />
    </div>
  );
}
