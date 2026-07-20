import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AccountDetailPanel } from "@/components/admin/account-detail-panel";

// Auth is enforced by the parent /admin layout (requirePlatformAdmin).
export default async function AdminAccountDetailPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;

  return (
    <div className="space-y-4">
      <Link
        href="/admin/accounts"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Cuentas
      </Link>
      <AccountDetailPanel accountId={accountId} />
    </div>
  );
}
