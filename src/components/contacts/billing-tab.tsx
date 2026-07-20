"use client";

import { useTranslations } from "next-intl";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { QuoteList } from "@/components/billing/quote-list";
import { InvoiceList } from "@/components/billing/invoice-list";

interface BillingTabProps {
  contactId: string;
}

/**
 * Patient's billing history — quotes and invoices scoped to this
 * contact, reusing the same QuoteList/InvoiceList used by the
 * standalone /billing module (just filtered by contact_id).
 */
export function BillingTab({ contactId }: BillingTabProps) {
  const t = useTranslations("Contacts.detailView.billingTab");

  return (
    <Tabs defaultValue="invoices">
      <TabsList className="bg-muted/50 border-b border-border">
        <TabsTrigger value="invoices" className="data-active:bg-muted data-active:text-primary text-muted-foreground">
          {t("invoices")}
        </TabsTrigger>
        <TabsTrigger value="quotes" className="data-active:bg-muted data-active:text-primary text-muted-foreground">
          {t("quotes")}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="invoices" className="pt-3">
        <InvoiceList contactId={contactId} />
      </TabsContent>
      <TabsContent value="quotes" className="pt-3">
        <QuoteList contactId={contactId} />
      </TabsContent>
    </Tabs>
  );
}
