"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Receipt } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InvoiceForm } from "./invoice-form";
import type { Invoice, InvoiceStatus } from "@/types";

const STATUS_STYLES: Record<InvoiceStatus, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  sent: "bg-primary/10 text-primary border-primary/30",
  paid: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  partial: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  overdue: "bg-red-500/10 text-red-400 border-red-500/30",
  void: "bg-muted text-muted-foreground border-border",
};

interface InvoiceListProps {
  contactId?: string;
}

export function InvoiceList({ contactId }: InvoiceListProps) {
  const t = useTranslations("Billing.invoiceList");

  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [loadingInvoiceId, setLoadingInvoiceId] = useState<string | null>(null);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (contactId) params.set("contact_id", contactId);
      const res = await fetch(`/api/billing/invoices?${params.toString()}`);
      const data = await res.json();
      setInvoices((data.invoices ?? []) as Invoice[]);
    } catch (err) {
      console.error("Failed to fetch invoices:", err);
      toast.error(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [contactId, t]);

  useEffect(() => {
    void fetchInvoices();
  }, [fetchInvoices]);

  function openCreate() {
    setEditingInvoice(null);
    setFormOpen(true);
  }

  async function openEdit(invoiceId: string) {
    setLoadingInvoiceId(invoiceId);
    try {
      const res = await fetch(`/api/billing/invoices/${invoiceId}`);
      const data = await res.json();
      setEditingInvoice(data.invoice as Invoice);
      setFormOpen(true);
    } catch (err) {
      console.error("Failed to load invoice:", err);
      toast.error(t("loadFailed"));
    } finally {
      setLoadingInvoiceId(null);
    }
  }

  const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        <Button type="button" size="sm" onClick={openCreate} className="bg-primary text-xs text-primary-foreground hover:bg-primary/90">
          <Plus className="mr-1 size-3.5" />
          {t("newInvoice")}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      ) : invoices.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <Receipt className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.number")}</TableHead>
              {!contactId && <TableHead>{t("columns.contact")}</TableHead>}
              <TableHead>{t("columns.date")}</TableHead>
              <TableHead>{t("columns.total")}</TableHead>
              <TableHead>{t("columns.paid")}</TableHead>
              <TableHead>{t("columns.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => (
              <TableRow
                key={invoice.id}
                onClick={() => openEdit(invoice.id)}
                className="cursor-pointer hover:bg-muted/50"
              >
                <TableCell className="font-medium text-foreground">
                  {loadingInvoiceId === invoice.id ? <Loader2 className="size-3.5 animate-spin" /> : invoice.invoice_number}
                </TableCell>
                {!contactId && <TableCell>{invoice.contact?.name || invoice.contact?.phone}</TableCell>}
                <TableCell>{dateFormatter.format(new Date(invoice.issue_date))}</TableCell>
                <TableCell>
                  {new Intl.NumberFormat(undefined, { style: "currency", currency: invoice.currency }).format(invoice.total)}
                </TableCell>
                <TableCell>
                  {new Intl.NumberFormat(undefined, { style: "currency", currency: invoice.currency }).format(invoice.amount_paid)}
                </TableCell>
                <TableCell>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[invoice.status]}`}>
                    {t(`statusValues.${invoice.status}`)}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <InvoiceForm
        open={formOpen}
        onOpenChange={setFormOpen}
        invoice={editingInvoice}
        contactId={contactId}
        onSaved={fetchInvoices}
      />
    </div>
  );
}
