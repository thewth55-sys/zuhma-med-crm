import type { SupabaseClient } from "@supabase/supabase-js";

import { computeDocumentTotals, computeLineTotal, type DiscountType } from "./totals";

function normalizeDiscountType(value: unknown): DiscountType {
  return value === "percent" || value === "fixed" ? value : null;
}

function normalizeDiscountValue(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export interface RawLineInput {
  product_id?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  tax_id?: string | null;
  discount_type?: string | null;
  discount_value?: number | null;
}

export interface ResolvedLine {
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  tax_id: string | null;
  tax_rate_snapshot: number;
  discount_type: DiscountType;
  discount_value: number;
  line_total: number;
  position: number;
}

/**
 * Server-side line resolution shared by the quotes and invoices POST
 * routes. `quantity`/`unit_price`/`tax_id`/discount fields are
 * legitimate client input (staff can override a line's price, pick
 * any tax, or apply a discount) — but the TAX RATE and every total
 * are derived values that must never be trusted from the client. This
 * looks up each `tax_id`'s current rate from the account's own
 * `taxes` table (RLS-scoped by the caller's client) and recomputes
 * every total from scratch.
 *
 * `documentDiscountType`/`documentDiscountValue` are the whole-
 * document discount (see design note in
 * 047_billing_discounts_and_service_sync.sql) — applied to the
 * subtotal only, not reproportioned across line taxes.
 *
 * Throws a plain Error with a user-facing message on invalid input —
 * callers should catch and turn it into a 400.
 */
export async function resolveBillingLines(
  supabase: SupabaseClient,
  accountId: string,
  rawItems: RawLineInput[],
  documentDiscountType: unknown = null,
  documentDiscountValue: unknown = 0
): Promise<{
  items: ResolvedLine[];
  subtotal: number;
  taxTotal: number;
  discountAmount: number;
  total: number;
  discountType: DiscountType;
  discountValue: number;
}> {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error("At least one line item is required");
  }

  const taxIds = [...new Set(rawItems.map((i) => i.tax_id).filter((id): id is string => !!id))];
  const taxRateById = new Map<string, number>();
  if (taxIds.length > 0) {
    const { data: taxes, error } = await supabase
      .from("taxes")
      .select("id, rate")
      .eq("account_id", accountId)
      .in("id", taxIds);
    if (error) throw new Error("Failed to resolve tax rates");
    for (const tax of taxes ?? []) taxRateById.set(tax.id, Number(tax.rate));
  }

  const items: ResolvedLine[] = rawItems.map((raw, index) => {
    const quantity = Number(raw.quantity);
    const unitPrice = Number(raw.unit_price);
    if (!raw.description?.trim()) throw new Error("Each line item needs a description");
    if (!(quantity > 0)) throw new Error("Quantity must be greater than zero");
    if (!(unitPrice >= 0)) throw new Error("Unit price cannot be negative");

    const taxRateSnapshot = raw.tax_id ? (taxRateById.get(raw.tax_id) ?? 0) : 0;
    const discountType = normalizeDiscountType(raw.discount_type);
    const discountValue = normalizeDiscountValue(raw.discount_value);
    if (discountType === "percent" && discountValue > 100) {
      throw new Error("A percentage discount cannot exceed 100");
    }

    return {
      product_id: raw.product_id || null,
      description: raw.description.trim(),
      quantity,
      unit_price: unitPrice,
      tax_id: raw.tax_id || null,
      tax_rate_snapshot: taxRateSnapshot,
      discount_type: discountType,
      discount_value: discountValue,
      line_total: computeLineTotal(quantity, unitPrice, discountType, discountValue),
      position: index,
    };
  });

  const docDiscountType = normalizeDiscountType(documentDiscountType);
  const docDiscountValue = normalizeDiscountValue(documentDiscountValue);
  if (docDiscountType === "percent" && docDiscountValue > 100) {
    throw new Error("A percentage discount cannot exceed 100");
  }

  const { subtotal, taxTotal, discountAmount, total } = computeDocumentTotals(items, docDiscountType, docDiscountValue);
  return { items, subtotal, taxTotal, discountAmount, total, discountType: docDiscountType, discountValue: docDiscountValue };
}
