"use client";

import { useTranslations } from "next-intl";
import { MarketingContentList } from "@/components/marketing/marketing-content-list";

export default function MarketingContentPage() {
  const t = useTranslations("Marketing.content");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <MarketingContentList />
    </div>
  );
}
