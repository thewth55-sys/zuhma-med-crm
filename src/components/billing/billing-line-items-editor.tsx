"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { computeDocumentTotals, computeLineTotal, type DiscountType } from "@/lib/billing/totals";
import type { Product, Tax } from "@/types";

export interface EditableLine {
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  tax_id: string | null;
  discount_type: DiscountType;
  discount_value: number;
}

interface BillingLineItemsEditorProps {
  items: EditableLine[];
  onChange: (items: EditableLine[]) => void;
  products: Product[];
  taxes: Tax[];
  disabled?: boolean;
  currency: string;
  documentDiscountType: DiscountType;
  documentDiscountValue: number;
  onDocumentDiscountChange: (type: DiscountType, value: number) => void;
}

function emptyLine(taxes: Tax[]): EditableLine {
  const defaultTax = taxes.find((t) => t.is_default);
  return {
    product_id: null,
    description: "",
    quantity: 1,
    unit_price: 0,
    tax_id: defaultTax?.id ?? null,
    discount_type: null,
    discount_value: 0,
  };
}

/**
 * Shared line-items table for quotes and invoices — the ~90% of the
 * form that's genuinely identical between the two document types.
 * Header fields, status actions, and payments stay in the thin
 * per-document wrappers (quote-form.tsx / invoice-form.tsx) instead
 * of being crammed in here with docType branches.
 */
export function BillingLineItemsEditor({
  items,
  onChange,
  products,
  taxes,
  disabled,
  currency,
  documentDiscountType,
  documentDiscountValue,
  onDocumentDiscountChange,
}: BillingLineItemsEditorProps) {
  const t = useTranslations("Billing.lineItems");

  const currencyFormatter = new Intl.NumberFormat(undefined, { style: "currency", currency });

  function updateLine(index: number, patch: Partial<EditableLine>) {
    const next = items.map((line, i) => (i === index ? { ...line, ...patch } : line));
    onChange(next);
  }

  function addLine() {
    onChange([...items, emptyLine(taxes)]);
  }

  function removeLine(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function pickProduct(index: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) {
      updateLine(index, { product_id: null });
      return;
    }
    updateLine(index, {
      product_id: product.id,
      description: product.name,
      unit_price: product.unit_price,
    });
  }

  const taxRateById = new Map(taxes.map((tx) => [tx.id, tx.rate]));
  const totals = computeDocumentTotals(
    items.map((line) => ({
      quantity: line.quantity,
      unit_price: line.unit_price,
      tax_rate_snapshot: line.tax_id ? (taxRateById.get(line.tax_id) ?? 0) : 0,
      discount_type: line.discount_type,
      discount_value: line.discount_value,
    })),
    documentDiscountType,
    documentDiscountValue
  );

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {items.map((line, index) => (
          <div
            key={index}
            className="grid grid-cols-1 gap-2 rounded-md border border-border bg-muted/40 p-2.5 sm:grid-cols-[1.3fr_0.9fr_65px_85px_110px_95px_32px] sm:items-center"
          >
            <div className="space-y-1">
              <select
                value={line.product_id ?? ""}
                disabled={disabled}
                onChange={(e) => pickProduct(index, e.target.value)}
                className="h-8 w-full rounded-md border border-border bg-muted px-2 text-xs text-foreground outline-none focus:border-primary disabled:opacity-60"
              >
                <option value="">{t("freeText")}</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <Input
                value={line.description}
                disabled={disabled}
                onChange={(e) => updateLine(index, { description: e.target.value })}
                placeholder={t("descriptionPlaceholder")}
                className="h-8 border-border bg-muted text-xs text-foreground disabled:opacity-60"
              />
            </div>

            <select
              value={line.tax_id ?? ""}
              disabled={disabled}
              onChange={(e) => updateLine(index, { tax_id: e.target.value || null })}
              className="h-8 w-full rounded-md border border-border bg-muted px-2 text-xs text-foreground outline-none focus:border-primary disabled:opacity-60"
            >
              <option value="">{t("noTax")}</option>
              {taxes.map((tax) => (
                <option key={tax.id} value={tax.id}>
                  {tax.name} ({tax.rate}%)
                </option>
              ))}
            </select>

            <Input
              type="number"
              min={0}
              step="0.01"
              value={line.quantity}
              disabled={disabled}
              onChange={(e) => updateLine(index, { quantity: Number(e.target.value) || 0 })}
              className="h-8 border-border bg-muted text-xs text-foreground disabled:opacity-60"
            />

            <Input
              type="number"
              min={0}
              step="0.01"
              value={line.unit_price}
              disabled={disabled}
              onChange={(e) => updateLine(index, { unit_price: Number(e.target.value) || 0 })}
              className="h-8 border-border bg-muted text-xs text-foreground disabled:opacity-60"
            />

            <div className="flex items-center gap-1">
              <select
                value={line.discount_type ?? ""}
                disabled={disabled}
                onChange={(e) =>
                  updateLine(index, {
                    discount_type: (e.target.value || null) as DiscountType,
                    discount_value: e.target.value ? line.discount_value : 0,
                  })
                }
                aria-label={t("discountType")}
                className="h-8 w-14 rounded-md border border-border bg-muted px-1 text-xs text-foreground outline-none focus:border-primary disabled:opacity-60"
              >
                <option value="">{t("discountNone")}</option>
                <option value="percent">%</option>
                <option value="fixed">$</option>
              </select>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={line.discount_value}
                disabled={disabled || !line.discount_type}
                onChange={(e) => updateLine(index, { discount_value: Number(e.target.value) || 0 })}
                aria-label={t("discountValue")}
                className="h-8 w-full border-border bg-muted text-xs text-foreground disabled:opacity-60"
              />
            </div>

            <span className="text-right text-xs text-muted-foreground">
              {currencyFormatter.format(
                computeLineTotal(line.quantity, line.unit_price, line.discount_type, line.discount_value)
              )}
            </span>

            {!disabled && (
              <button
                type="button"
                onClick={() => removeLine(index)}
                aria-label={t("removeLine")}
                className="justify-self-end text-red-400 hover:text-red-300"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {!disabled && (
        <Button type="button" variant="outline" size="sm" onClick={addLine} className="text-xs">
          <Plus className="mr-1 size-3.5" />
          {t("addLine")}
        </Button>
      )}

      <div className="ml-auto w-full max-w-xs space-y-1 rounded-md border border-border bg-muted/40 p-3 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>{t("subtotal")}</span>
          <span>{currencyFormatter.format(totals.subtotal)}</span>
        </div>

        <div className="flex items-center justify-between gap-2 text-muted-foreground">
          <span>{t("documentDiscount")}</span>
          {disabled ? (
            <span>{currencyFormatter.format(totals.discountAmount)}</span>
          ) : (
            <div className="flex items-center gap-1">
              <select
                value={documentDiscountType ?? ""}
                onChange={(e) =>
                  onDocumentDiscountChange(
                    (e.target.value || null) as DiscountType,
                    e.target.value ? documentDiscountValue : 0
                  )
                }
                aria-label={t("discountType")}
                className="h-7 w-14 rounded-md border border-border bg-muted px-1 text-xs text-foreground outline-none focus:border-primary"
              >
                <option value="">{t("discountNone")}</option>
                <option value="percent">%</option>
                <option value="fixed">$</option>
              </select>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={documentDiscountValue}
                disabled={!documentDiscountType}
                onChange={(e) => onDocumentDiscountChange(documentDiscountType, Number(e.target.value) || 0)}
                aria-label={t("discountValue")}
                className="h-7 w-20 border-border bg-muted text-xs text-foreground disabled:opacity-60"
              />
            </div>
          )}
        </div>

        <div className="flex justify-between text-muted-foreground">
          <span>{t("tax")}</span>
          <span>{currencyFormatter.format(totals.taxTotal)}</span>
        </div>
        <div className="flex justify-between border-t border-border pt-1 font-medium text-foreground">
          <span>{t("total")}</span>
          <span>{currencyFormatter.format(totals.total)}</span>
        </div>
      </div>
    </div>
  );
}
