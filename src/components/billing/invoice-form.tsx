"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Search, Download, MessageCircle, Mail } from "lucide-react";
import { useTranslations } from "next-intl";

import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BillingLineItemsEditor, type EditableLine } from "./billing-line-items-editor";
import { PaymentForm } from "./payment-form";
import { PaymentList } from "./payment-list";
import type { Contact, DiscountType, Invoice, InvoiceStatus, Payment, Product, Tax } from "@/types";

interface InvoiceFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice?: Invoice | null;
  contactId?: string;
  dealId?: string;
  onSaved: () => void;
}

const MANUAL_STATUS_OPTIONS: InvoiceStatus[] = ["draft", "sent", "overdue", "void"];
const ITEMS_LOCKED_STATUSES: InvoiceStatus[] = ["paid", "void"];

export function InvoiceForm({ open, onOpenChange, invoice, contactId, dealId, onSaved }: InvoiceFormProps) {
  const t = useTranslations("Billing.invoiceForm");
  const supabase = createClient();
  const isEdit = !!invoice;

  const [products, setProducts] = useState<Product[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [currency, setCurrency] = useState("USD");

  const [contact, setContact] = useState<Contact | null>(invoice?.contact ?? null);
  const [contactQuery, setContactQuery] = useState("");
  const [contactResults, setContactResults] = useState<Contact[]>([]);
  const contactSearchSeq = useRef(0);

  const [items, setItems] = useState<EditableLine[]>([]);
  const [discountType, setDiscountType] = useState<DiscountType>(null);
  const [discountValue, setDiscountValue] = useState(0);
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<InvoiceStatus>("draft");
  const [saving, setSaving] = useState(false);

  const [payments, setPayments] = useState<Payment[]>(invoice?.payments ?? []);
  const [amountPaid, setAmountPaid] = useState(invoice?.amount_paid ?? 0);
  const [invoiceTotal, setInvoiceTotal] = useState(invoice?.total ?? 0);
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [sendingWhatsapp, setSendingWhatsapp] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  const itemsLocked = isEdit && ITEMS_LOCKED_STATUSES.includes(status);

  async function generateInvoicePdf(): Promise<{ url: string; filename: string } | null> {
    if (!invoice) return null;
    const res = await fetch(`/api/billing/invoices/${invoice.id}/pdf`, { method: "POST" });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.url) {
      toast.error(body?.error ?? t("pdfFailed"));
      return null;
    }
    return { url: body.url, filename: body.filename };
  }

  async function handleDownloadPdf() {
    setDownloadingPdf(true);
    try {
      const result = await generateInvoicePdf();
      if (result) window.open(result.url, "_blank");
    } finally {
      setDownloadingPdf(false);
    }
  }

  async function handleSendWhatsapp() {
    if (!invoice?.contact_id) return;
    setSendingWhatsapp(true);
    try {
      const result = await generateInvoicePdf();
      if (!result) return;
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: invoice.contact_id,
          message_type: "document",
          media_url: result.url,
          filename: result.filename,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(body?.error ?? t("whatsappSendFailed"));
        return;
      }
      toast.success(t("whatsappSendSuccess"));
    } finally {
      setSendingWhatsapp(false);
    }
  }

  async function handleSendEmail() {
    if (!invoice?.id) return;
    setSendingEmail(true);
    try {
      const res = await fetch(`/api/billing/invoices/${invoice.id}/send-email`, { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(body?.error ?? t("emailSendFailed"));
        return;
      }
      toast.success(t("emailSendSuccess"));
    } finally {
      setSendingEmail(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [p, tx, acct] = await Promise.all([
        supabase.from("products").select("*").eq("is_active", true).order("name"),
        supabase.from("taxes").select("*").eq("is_active", true).order("name"),
        supabase.from("accounts").select("default_currency").maybeSingle(),
      ]);
      setProducts((p.data ?? []) as Product[]);
      setTaxes((tx.data ?? []) as Tax[]);
      if (acct.data?.default_currency) setCurrency(acct.data.default_currency);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (invoice) {
      setContact(invoice.contact ?? null);
      setItems(
        (invoice.items ?? []).map((i) => ({
          product_id: i.product_id,
          description: i.description,
          quantity: i.quantity,
          unit_price: i.unit_price,
          tax_id: i.tax_id,
          discount_type: i.discount_type,
          discount_value: i.discount_value,
        }))
      );
      setDiscountType(invoice.discount_type);
      setDiscountValue(invoice.discount_value);
      setDueDate(invoice.due_date ?? "");
      setNotes(invoice.notes ?? "");
      setStatus(invoice.status);
      setCurrency(invoice.currency);
      setPayments(invoice.payments ?? []);
      setAmountPaid(invoice.amount_paid);
      setInvoiceTotal(invoice.total);
    } else {
      setContact(null);
      setItems([]);
      setDiscountType(null);
      setDiscountValue(0);
      setDueDate("");
      setNotes("");
      setStatus("draft");
      setPayments([]);
      setAmountPaid(0);
      setInvoiceTotal(0);
    }
    setContactQuery("");
    setContactResults([]);
  }, [open, invoice]);

  const searchContacts = useCallback(
    async (query: string) => {
      const seq = ++contactSearchSeq.current;
      const like = `%${query.trim()}%`;
      const { data } = await supabase.from("contacts").select("*").or(`name.ilike.${like},phone.ilike.${like}`).limit(8);
      if (seq !== contactSearchSeq.current) return;
      setContactResults((data ?? []) as Contact[]);
    },
    [supabase]
  );

  useEffect(() => {
    if (!contactQuery.trim()) {
      setContactResults([]);
      return;
    }
    const handle = setTimeout(() => void searchContacts(contactQuery), 300);
    return () => clearTimeout(handle);
  }, [contactQuery, searchContacts]);

  async function resolveContact(): Promise<Contact | null> {
    if (contact) return contact;
    if (contactId) {
      const { data } = await supabase.from("contacts").select("*").eq("id", contactId).maybeSingle();
      return (data as Contact) ?? null;
    }
    return null;
  }

  async function refreshPayments() {
    if (!invoice) return;
    const res = await fetch(`/api/billing/invoices/${invoice.id}`);
    if (!res.ok) return;
    const data = await res.json();
    setPayments(data.invoice.payments ?? []);
    setAmountPaid(data.invoice.amount_paid);
    setStatus(data.invoice.status);
    onSaved();
  }

  async function handleDeletePayment(paymentId: string) {
    if (!invoice) return;
    setDeletingPaymentId(paymentId);
    try {
      const res = await fetch(`/api/billing/invoices/${invoice.id}/payments/${paymentId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("failed");
      toast.success(t("paymentDeleted"));
      await refreshPayments();
    } catch (err) {
      console.error("Delete payment error:", err);
      toast.error(t("paymentDeleteFailed"));
    } finally {
      setDeletingPaymentId(null);
    }
  }

  async function handleSave() {
    const resolvedContact = await resolveContact();
    if (!resolvedContact) {
      toast.error(t("contactRequired"));
      return;
    }
    if (items.length === 0) {
      toast.error(t("itemsRequired"));
      return;
    }

    setSaving(true);
    try {
      if (isEdit && invoice) {
        const payload: Record<string, unknown> = {
          status,
          notes: notes || null,
          due_date: dueDate || null,
        };
        if (!itemsLocked) {
          payload.items = items;
          payload.discount_type = discountType;
          payload.discount_value = discountValue;
        }
        const res = await fetch(`/api/billing/invoices/${invoice.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("update failed");
        toast.success(t("updated"));
      } else {
        const res = await fetch("/api/billing/invoices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contact_id: resolvedContact.id,
            deal_id: dealId || null,
            due_date: dueDate || null,
            notes: notes || null,
            items,
            discount_type: discountType,
            discount_value: discountValue,
          }),
        });
        if (!res.ok) throw new Error("create failed");
        toast.success(t("created"));
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      console.error("Save invoice error:", err);
      toast.error(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border text-popover-foreground w-full max-w-3xl sm:max-w-3xl max-h-[90vh] p-0 flex flex-col">
        <div className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="border-b border-border/50 p-4">
            <DialogTitle className="text-popover-foreground">
              {isEdit ? `${t("editTitle")} — ${invoice?.invoice_number}` : t("newTitle")}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {!contactId && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t("contact")}</Label>
                {contact ? (
                  <div className="flex items-center justify-between rounded-md border border-border bg-muted px-2.5 py-1.5 text-sm">
                    <div>
                      <p className="text-foreground">{contact.name || contact.phone}</p>
                      <p className="text-xs text-muted-foreground">{contact.phone}</p>
                    </div>
                    {!isEdit && (
                      <button type="button" onClick={() => setContact(null)} className="text-xs text-primary hover:text-primary/80">
                        {t("changeContact")}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={contactQuery}
                      onChange={(e) => setContactQuery(e.target.value)}
                      placeholder={t("searchContactPlaceholder")}
                      className="h-8 border-border bg-muted pl-8 text-xs text-foreground"
                    />
                    {contactQuery.trim() && contactResults.length > 0 && (
                      <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
                        {contactResults.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setContact(c);
                              setContactQuery("");
                              setContactResults([]);
                            }}
                            className="flex w-full flex-col items-start px-2.5 py-1.5 text-left text-xs hover:bg-muted"
                          >
                            <span className="text-foreground">{c.name || c.phone}</span>
                            <span className="text-muted-foreground">{c.phone}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t("dueDate")}</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="h-9 border-border bg-muted text-sm text-foreground"
                />
              </div>
              {isEdit && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t("status")}</Label>
                  {status === "paid" || status === "partial" ? (
                    <div className="flex h-9 items-center rounded-md border border-border bg-muted px-2.5 text-sm text-muted-foreground">
                      {t(`statusValues.${status}`)}
                    </div>
                  ) : (
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as InvoiceStatus)}
                      className="h-9 w-full rounded-md border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary"
                    >
                      {MANUAL_STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {t(`statusValues.${s}`)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t("notes")}</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-9 border-border bg-muted text-sm text-foreground"
              />
            </div>

            <BillingLineItemsEditor
              items={items}
              onChange={setItems}
              products={products}
              taxes={taxes}
              disabled={itemsLocked}
              currency={currency}
              documentDiscountType={discountType}
              documentDiscountValue={discountValue}
              onDocumentDiscountChange={(type, value) => {
                setDiscountType(type);
                setDiscountValue(value);
              }}
            />

            {isEdit && invoice && (
              <div className="space-y-2 rounded-lg border border-border bg-muted/50 p-3">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("paymentsTitle")}</p>
                <PaymentList
                  invoiceId={invoice.id}
                  payments={payments}
                  currency={currency}
                  onDelete={handleDeletePayment}
                  deletingId={deletingPaymentId}
                  disabled={status === "void"}
                />
                {status !== "void" && (
                  <PaymentForm
                    invoiceId={invoice.id}
                    remaining={Math.max(0, invoiceTotal - amountPaid)}
                    currency={currency}
                    onSaved={refreshPayments}
                  />
                )}
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-border/50 p-4">
            {isEdit && (
              <div className="mr-auto flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadPdf}
                  disabled={downloadingPdf || sendingWhatsapp}
                  className="border-border text-muted-foreground hover:bg-muted"
                >
                  {downloadingPdf ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Download className="size-3.5" />
                  )}
                  {t("downloadPdf")}
                </Button>
                {invoice?.contact_id && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSendWhatsapp}
                    disabled={downloadingPdf || sendingWhatsapp}
                    className="border-border text-muted-foreground hover:bg-muted"
                  >
                    {sendingWhatsapp ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <MessageCircle className="size-3.5" />
                    )}
                    {t("sendWhatsapp")}
                  </Button>
                )}
                {invoice?.contact?.email && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSendEmail}
                    disabled={downloadingPdf || sendingWhatsapp || sendingEmail}
                    className="border-border text-muted-foreground hover:bg-muted"
                  >
                    {sendingEmail ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Mail className="size-3.5" />
                    )}
                    {t("sendEmail")}
                  </Button>
                )}
              </div>
            )}
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : t("save")}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
