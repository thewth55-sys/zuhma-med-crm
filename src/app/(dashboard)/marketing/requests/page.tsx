"use client";

import { Inbox } from "lucide-react";
import { useTranslations } from "next-intl";

export default function MarketingRequestsPage() {
  const t = useTranslations("Marketing.requests");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
        <Inbox className="size-8 text-muted-foreground" />
        <p className="max-w-sm text-sm text-muted-foreground">{t("comingSoon")}</p>
      </div>
    </div>
  );
}
