"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Search, FileCheck2, Download, MessageCircle, Mail } from "lucide-react";
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
import type { Contact, DiscountType, Product, Quote, QuoteStatus, Tax } from "@/types";

interface QuoteFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote?: Quote | null;
  contactId?: string;
  dealId?: string;
  onSaved: () => void;
}

const STATUS_OPTIONS: QuoteStatus[] = ["draft", "sent", "accepted", "rejected", "expired"];

export function QuoteForm({ open, onOpenChange, quote, contactId, dealId, onSaved }: QuoteFormProps) {
  const t = useTranslations("Billing.quoteForm");
  const supabase = createClient();
  const isEdit = !!quote;
  const isConverted = quote?.status === "converted";

  const [products, setProducts] = useState<Product[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [currency, setCurrency] = useState("USD");

  const [contact, setContact] = useState<Contact | null>(quote?.contact ?? null);
  const [contactQuery, setContactQuery] = useState("");
  const [contactResults, setContactResults] = useState<Contact[]>([]);
  const contactSearchSeq = useRef(0);

  const [items, setItems] = useState<EditableLine[]>([]);
  const [discountType, setDiscountType] = useState<DiscountType>(null);
  const [discountValue, setDiscountValue] = useState(0);
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<QuoteStatus>("draft");
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [sendingWhatsapp, setSendingWhatsapp] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  async function generateQuotePdf(): Promise<{ url: string; filename: string } | null> {
    if (!quote) return null;
    const res = await fetch(`/api/billing/quotes/${quote.id}/pdf`, { method: "POST" });
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
      const result = await generateQuotePdf();
      if (result) window.open(result.url, "_blank");
    } finally {
      setDownloadingPdf(false);
    }
  }

  async function handleSendWhatsapp() {
    if (!quote?.contact_id) return;
    setSendingWhatsapp(true);
    try {
      const result = await generateQuotePdf();
      if (!result) return;
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: quote.contact_id,
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
    if (!quote?.id) return;
    setSendingEmail(true);
    try {
      const res = await fetch(`/api/billing/quotes/${quote.id}/send-email`, { method: "POST" });
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
    if (quote) {
      setContact(quote.contact ?? null);
      setItems(
        (quote.items ?? []).map((i) => ({
          product_id: i.product_id,
          description: i.description,
          quantity: i.quantity,
          unit_price: i.unit_price,
          tax_id: i.tax_id,
          discount_type: i.discount_type,
          discount_value: i.discount_value,
        }))
      );
      setDiscountType(quote.discount_type);
      setDiscountValue(quote.discount_value);
      setExpiryDate(quote.expiry_date ?? "");
      setNotes(quote.notes ?? "");
      setStatus(quote.status);
      setCurrency(quote.currency);
    } else {
      setContact(null);
      setItems([]);
      setDiscountType(null);
      setDiscountValue(0);
      setExpiryDate("");
      setNotes("");
      setStatus("draft");
    }
    setContactQuery("");
    setContactResults([]);
  }, [open, quote]);

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
      if (isEdit && quote) {
        const res = await fetch(`/api/billing/quotes/${quote.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status,
            notes: notes || null,
            expiry_date: expiryDate || null,
            items,
            discount_type: discountType,
            discount_value: discountValue,
          }),
        });
        if (!res.ok) throw new Error("update failed");
        toast.success(t("updated"));
      } else {
        const res = await fetch("/api/billing/quotes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contact_id: resolvedContact.id,
            deal_id: dealId || null,
            expiry_date: expiryDate || null,
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
      console.error("Save quote error:", err);
      toast.error(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleConvert() {
    if (!quote) return;
    setConverting(true);
    try {
      const res = await fetch(`/api/billing/quotes/${quote.id}/convert`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "convert failed");
      }
      toast.success(t("converted"));
      onOpenChange(false);
      onSaved();
    } catch (err) {
      console.error("Convert quote error:", err);
      toast.error(t("convertFailed"));
    } finally {
      setConverting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border text-popover-foreground w-full max-w-3xl sm:max-w-3xl max-h-[90vh] p-0 flex flex-col">
        <div className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="border-b border-border/50 p-4">
            <DialogTitle className="text-popover-foreground">
              {isEdit ? `${t("editTitle")} — ${quote?.quote_number}` : t("newTitle")}
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
                <Label className="text-xs text-muted-foreground">{t("expiryDate")}</Label>
                <Input
                  type="date"
                  value={expiryDate}
                  disabled={isConverted}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="h-9 border-border bg-muted text-sm text-foreground disabled:opacity-60"
                />
              </div>
              {isEdit && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t("status")}</Label>
                  <select
                    value={status}
                    disabled={isConverted}
                    onChange={(e) => setStatus(e.target.value as QuoteStatus)}
                    className="h-9 w-full rounded-md border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {t(`statusValues.${s}`)}
                      </option>
                    ))}
                    {isConverted && <option value="converted">{t("statusValues.converted")}</option>}
                  </select>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t("notes")}</Label>
              <Input
                value={notes}
                disabled={isConverted}
                onChange={(e) => setNotes(e.target.value)}
                className="h-9 border-border bg-muted text-sm text-foreground disabled:opacity-60"
              />
            </div>

            <BillingLineItemsEditor
              items={items}
              onChange={setItems}
              products={products}
              taxes={taxes}
              disabled={isConverted}
              currency={currency}
              documentDiscountType={discountType}
              documentDiscountValue={discountValue}
              onDocumentDiscountChange={(type, value) => {
                setDiscountType(type);
                setDiscountValue(value);
              }}
            />
          </div>

          <DialogFooter className="border-t border-border/50 p-4">
            <div className="mr-auto flex flex-wrap items-center gap-2">
              {isEdit && (
                <>
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
                  {quote?.contact_id && (
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
                  {quote?.contact?.email && (
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
                </>
              )}
              {isEdit && quote?.status === "accepted" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleConvert}
                  disabled={converting || saving}
                  className="border-primary/40 text-primary hover:bg-primary/10"
                >
                  {converting ? <Loader2 className="size-4 animate-spin" /> : <FileCheck2 className="size-4" />}
                  {t("convertToInvoice")}
                </Button>
              )}
            </div>
            {!isConverted && (
              <Button
                type="button"
                onClick={handleSave}
                disabled={saving || converting}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : t("save")}
              </Button>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
