import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { requireStaffRole, resolveAccountOwner } from "@/lib/auth/platform-admin";
import { ForbiddenError } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/supabase/admin-client";
import { AdminMarketingContentForm } from "@/components/admin/admin-marketing-content-form";
import { AdminMarketingContentManager } from "@/components/admin/admin-marketing-content-manager";

export default async function AdminAccountMarketingContentPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  try {
    await requireStaffRole(["marketing"]);
  } catch (err) {
    if (err instanceof ForbiddenError) redirect("/admin");
    throw err;
  }

  const { accountId } = await params;
  const owner = await resolveAccountOwner(accountId);
  if (!owner) notFound();

  const { data: accountRow } = await supabaseAdmin().from('accounts').select('marketing_executive_id').eq('id', accountId).maybeSingle();
  const currentExecutiveId = accountRow?.marketing_executive_id ?? null;

  return (
    <div className="space-y-4">
      <Link href="/admin/accounts" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Cuentas
      </Link>
      <div>
        <h1 className="text-xl font-semibold text-foreground">Contenido de Marketing — {owner.accountName}</h1>
        <p className="text-sm text-muted-foreground">Sube piezas de contenido (Reel / Carrusel / Historia) para que la clínica las apruebe.</p>
      </div>
      <AdminMarketingContentForm accountId={accountId} />
      <AdminMarketingContentManager accountId={accountId} currentExecutiveId={currentExecutiveId} />
    </div>
  );
}