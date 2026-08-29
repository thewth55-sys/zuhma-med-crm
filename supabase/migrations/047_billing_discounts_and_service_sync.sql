-- ============================================================
-- 047_billing_discounts_and_service_sync.sql — line/document
-- discounts on quotes & invoices, and a link from service_types to
-- the billing product catalog.
--
-- Design notes
--   - Line-level discount (quote_items/invoice_items): discount_type
--     ('percent'|'fixed') + discount_value. Applied to
--     quantity*unit_price BEFORE tax — line_total keeps its existing
--     039 semantics (the post-discount, pre-tax amount), so no
--     downstream schema change is needed for it.
--   - Document-level discount (quotes/invoices): discount_type +
--     discount_value + a snapshotted discount_amount, applied to the
--     subtotal only. tax_total is left as the sum of each line's own
--     tax (already computed on that line's post-line-discount total)
--     — the document-level discount does NOT reproportion tax across
--     lines. Deliberate simplification: prorating tax under a
--     whole-document discount has no single "correct" formula, and
--     nothing here requires tax-exact behavior. total = subtotal -
--     discount_amount + tax_total.
--   - service_types.product_id links a scheduling service type to its
--     billing catalog price, ON DELETE SET NULL (deleting the product
--     unlinks the service type instead of deleting it).
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE quote_items
  ADD COLUMN IF NOT EXISTS discount_type text CHECK (discount_type IN ('percent', 'fixed')),
  ADD COLUMN IF NOT EXISTS discount_value numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_value >= 0);

ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS discount_type text CHECK (discount_type IN ('percent', 'fixed')),
  ADD COLUMN IF NOT EXISTS discount_value numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_value >= 0);

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS discount_type text CHECK (discount_type IN ('percent', 'fixed')),
  ADD COLUMN IF NOT EXISTS discount_value numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS discount_type text CHECK (discount_type IN ('percent', 'fixed')),
  ADD COLUMN IF NOT EXISTS discount_value numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE service_types
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_service_types_product ON service_types(product_id);
