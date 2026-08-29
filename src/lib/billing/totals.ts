/**
 * Pure money-math helpers for the billing module — no I/O, safe to
 * unit test directly. Used by the quote/invoice forms for live totals
 * AND by the billing API routes to recompute an authoritative total
 * server-side from the submitted line items (never trust a
 * client-supplied subtotal/tax_total/total for a financial document).
 */

export type DiscountType = "percent" | "fixed" | null;

export interface BillingLineInput {
  quantity: number;
  unit_price: number;
  tax_rate_snapshot: number;
  discount_type?: DiscountType;
  discount_value?: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Amount deducted for a given discount type/value applied to a base
 * amount. 'percent' is a percentage of `base`; 'fixed' is a flat
 * amount. Clamped so a discount can never exceed the base (no
 * negative totals from an over-entered discount).
 */
export function computeDiscountAmount(base: number, discountType: DiscountType, discountValue: number): number {
  if (!discountType || !(discountValue > 0) || !(base > 0)) return 0;
  const raw = discountType === "percent" ? base * (discountValue / 100) : discountValue;
  return round2(Math.min(Math.max(raw, 0), base));
}

/** quantity × unit_price, minus any line-level discount, rounded to cents. */
export function computeLineTotal(
  quantity: number,
  unitPrice: number,
  discountType: DiscountType = null,
  discountValue = 0
): number {
  const gross = round2(quantity * unitPrice);
  const discount = computeDiscountAmount(gross, discountType, discountValue);
  return round2(gross - discount);
}

export interface DocumentTotals {
  subtotal: number;
  taxTotal: number;
  /** Whole-document discount amount, already netted out of `total`. */
  discountAmount: number;
  total: number;
}

/**
 * Sums (already line-discounted) line totals into subtotal, applies
 * each line's own tax_rate_snapshot to its own line total (not a
 * single blended rate across the document — different lines can
 * carry different taxes), then applies an optional whole-document
 * discount to the subtotal only (see design note in
 * 047_billing_discounts_and_service_sync.sql — tax is not
 * reproportioned by a document-level discount).
 */
export function computeDocumentTotals(
  items: BillingLineInput[],
  documentDiscountType: DiscountType = null,
  documentDiscountValue = 0
): DocumentTotals {
  let subtotal = 0;
  let taxTotal = 0;

  for (const item of items) {
    const lineTotal = computeLineTotal(item.quantity, item.unit_price, item.discount_type ?? null, item.discount_value ?? 0);
    subtotal += lineTotal;
    taxTotal += round2(lineTotal * (item.tax_rate_snapshot / 100));
  }

  subtotal = round2(subtotal);
  taxTotal = round2(taxTotal);
  const discountAmount = computeDiscountAmount(subtotal, documentDiscountType, documentDiscountValue);

  return { subtotal, taxTotal, discountAmount, total: round2(subtotal - discountAmount + taxTotal) };
}
