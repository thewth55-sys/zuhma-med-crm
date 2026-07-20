"use client";

import { Receipt } from "lucide-react";
import { useTranslations } from "next-intl";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { QuoteList } from "@/components/billing/quote-list";
import { InvoiceList } from "@/components/billing/invoice-list";
import { ProductManager } from "@/components/settings/product-manager";

export default function BillingPage() {
  const t = useTranslations("Billing.page");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Receipt className="size-6 text-primary" />
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Tabs defaultValue="invoices">
        <TabsList className="bg-muted/50 border-b border-border">
          <TabsTrigger value="invoices" className="data-active:bg-muted data-active:text-primary text-muted-foreground">
            {t("invoices")}
          </TabsTrigger>
          <TabsTrigger value="quotes" className="data-active:bg-muted data-active:text-primary text-muted-foreground">
            {t("quotes")}
          </TabsTrigger>
          <TabsTrigger value="priceList" className="data-active:bg-muted data-active:text-primary text-muted-foreground">
            {t("priceList")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="invoices" className="pt-4">
          <InvoiceList />
        </TabsContent>
        <TabsContent value="quotes" className="pt-4">
          <QuoteList />
        </TabsContent>
        <TabsContent value="priceList" className="pt-4">
          <ProductManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
