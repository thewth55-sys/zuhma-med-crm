"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PaymentMethod } from "@/types";

interface PaymentFormProps {
  invoiceId: string;
  remaining: number;
  currency: string;
  onSaved: () => void;
}

const METHODS: PaymentMethod[] = ["cash", "card", "transfer", "other"];

function todayLocalDate(): string {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

export function PaymentForm({ invoiceId, remaining, currency, onSaved }: PaymentFormProps) {
  const t = useTranslations("Billing.payments");
  const [amount, setAmount] = useState(remaining > 0 ? String(remaining) : "");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [paidAt, setPaidAt] = useState(todayLocalDate());
  const [saving, setSaving] = useState(false);
  const currencyFormatter = new Intl.NumberFormat(undefined, { style: "currency", currency });

  async function handleSubmit() {
    const value = Number(amount);
    if (!(value > 0)) {
      toast.error(t("amountRequired"));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/billing/invoices/${invoiceId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: value, method, paid_at: paidAt || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "failed");
      }
      toast.success(t("recorded"));
      setAmount("");
      setPaidAt(todayLocalDate());
      onSaved();
    } catch (err) {
      console.error("Record payment error:", err);
      toast.error(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">
          {t("amount")}
          {remaining > 0 && <span className="ml-1">({t("remaining", { amount: currencyFormatter.format(remaining) })})</span>}
        </Label>
        <Input
          type="number"
          min={0}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="h-8 w-32 border-border bg-muted text-xs text-foreground"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{t("method")}</Label>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          className="h-8 rounded-md border border-border bg-muted px-2 text-xs text-foreground outline-none focus:border-primary"
        >
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {t(`methods.${m}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{t("paidAt")}</Label>
        <Input
          type="date"
          value={paidAt}
          onChange={(e) => setPaidAt(e.target.value)}
          className="h-8 w-36 border-border bg-muted text-xs text-foreground"
        />
      </div>
      <Button type="button" size="sm" onClick={handleSubmit} disabled={saving} className="h-8 text-xs">
        {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
        {t("addPayment")}
      </Button>
    </div>
  );
}
