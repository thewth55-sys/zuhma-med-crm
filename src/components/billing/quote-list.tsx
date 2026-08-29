"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, FileText } from "lucide-react";
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
import { QuoteForm } from "./quote-form";
import type { Quote, QuoteStatus } from "@/types";

const STATUS_STYLES: Record<QuoteStatus, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  sent: "bg-primary/10 text-primary border-primary/30",
  accepted: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  rejected: "bg-red-500/10 text-red-400 border-red-500/30",
  expired: "bg-muted text-muted-foreground border-border",
  converted: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
};

interface QuoteListProps {
  contactId?: string;
}

export function QuoteList({ contactId }: QuoteListProps) {
  const t = useTranslations("Billing.quoteList");

  const [loading, setLoading] = useState(true);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [loadingQuoteId, setLoadingQuoteId] = useState<string | null>(null);

  const fetchQuotes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (contactId) params.set("contact_id", contactId);
      const res = await fetch(`/api/billing/quotes?${params.toString()}`);
      const data = await res.json();
      setQuotes((data.quotes ?? []) as Quote[]);
    } catch (err) {
      console.error("Failed to fetch quotes:", err);
      toast.error(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [contactId, t]);

  useEffect(() => {
    void fetchQuotes();
  }, [fetchQuotes]);

  function openCreate() {
    setEditingQuote(null);
    setFormOpen(true);
  }

  async function openEdit(quoteId: string) {
    setLoadingQuoteId(quoteId);
    try {
      const res = await fetch(`/api/billing/quotes/${quoteId}`);
      const data = await res.json();
      setEditingQuote(data.quote as Quote);
      setFormOpen(true);
    } catch (err) {
      console.error("Failed to load quote:", err);
      toast.error(t("loadFailed"));
    } finally {
      setLoadingQuoteId(null);
    }
  }

  const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        <Button type="button" size="sm" onClick={openCreate} className="bg-primary text-xs text-primary-foreground hover:bg-primary/90">
          <Plus className="mr-1 size-3.5" />
          {t("newQuote")}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      ) : quotes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <FileText className="size-6 text-muted-foreground" />
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
              <TableHead>{t("columns.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quotes.map((quote) => (
              <TableRow
                key={quote.id}
                onClick={() => openEdit(quote.id)}
                className="cursor-pointer hover:bg-muted/50"
              >
                <TableCell className="font-medium text-foreground">
                  {loadingQuoteId === quote.id ? <Loader2 className="size-3.5 animate-spin" /> : quote.quote_number}
                </TableCell>
                {!contactId && <TableCell>{quote.contact?.name || quote.contact?.phone}</TableCell>}
                <TableCell>{dateFormatter.format(new Date(quote.issue_date))}</TableCell>
                <TableCell>
                  {new Intl.NumberFormat(undefined, { style: "currency", currency: quote.currency }).format(quote.total)}
                </TableCell>
                <TableCell>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[quote.status]}`}>
                    {t(`statusValues.${quote.status}`)}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <QuoteForm
        open={formOpen}
        onOpenChange={setFormOpen}
        quote={editingQuote}
        contactId={contactId}
        onSaved={fetchQuotes}
      />
    </div>
  );
}
