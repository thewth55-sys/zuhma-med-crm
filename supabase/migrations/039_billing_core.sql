-- ============================================================
-- 039_billing_core.sql — Billing module (quotes, catalog, taxes,
-- invoices, payments)
--
-- Design notes
--   - No prior sequential-numbering pattern exists anywhere in this
--     schema (checked). `billing_counters` + `next_billing_number()`
--     is a small per-account counter table with an atomic
--     UPSERT ... ON CONFLICT DO UPDATE ... RETURNING — the row lock
--     taken by the DO UPDATE serializes concurrent callers, no
--     explicit SELECT ... FOR UPDATE needed (that's only required for
--     multi-step validation before the write, e.g. 019's invitation
--     RPCs; this is a single atomic step). If a later INSERT into
--     quotes/invoices fails after the number was consumed, the
--     sequence has a gap — standard behavior for any invoice
--     numbering scheme (same as a native SEQUENCE), not a bug.
--   - `quote_items` / `invoice_items` / `payments` each carry their
--     OWN `account_id` column and their OWN RLS policy on it, rather
--     than relying on a join back to the parent document. RLS in
--     Postgres is strictly per-table — there is no implicit policy
--     inheritance from a parent row via FK. This mirrors
--     `doctor_availability_blocks` (037) and `clinical_note_addenda`
--     (038), which already solve this the same way in this schema.
--   - `tax_rate_snapshot` on line items captures the tax rate at the
--     moment the line was added — tax rates can change later without
--     silently altering historical documents.
--   - `payments` recompute `invoices.amount_paid` via a full
--     recompute (SUM over that invoice's payments) on every
--     INSERT/DELETE, not an incremental delta. This deliberately
--     mirrors the ORIGINAL broadcast-count trigger design (003), not
--     its incremental replacement (005) — that replacement exists
--     purely because a broadcast can have thousands of recipients;
--     an invoice realistically has a handful of payments, so a full
--     recompute is cheap AND self-correcting (immune to drift from
--     any future manual data surgery), with none of the downside that
--     forced 005's incremental rewrite.
--   - `invoices.amount_paid` is written ONLY by that trigger — the
--     app never sets it directly.
--   - No currency conversion in v1: `quotes.currency` / `invoices.currency`
--     are fixed to `accounts.default_currency` by the API layer, no
--     currency selector in the UI. `products.unit_price` has no
--     currency of its own.
--   - `products`/`taxes` are plain settings-tier catalog tables
--     (any member reads, admin+ writes) — same shape as `rooms` /
--     `service_types` from 037.
--   - `quotes`/`invoices` are operational (agent+ writes), same as
--     `appointments`. `invoices` DELETE is admin+ only — a financial
--     document is more sensitive to lose than an appointment.
--   - API routes recompute subtotal/tax_total/total server-side from
--     the submitted line items before insert — never trust a
--     client-supplied total for a financial document.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ------------------------------------------------------------
-- products (catálogo de productos/servicios)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text,
  unit_price    numeric(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_account ON products(account_id);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS products_select ON products;
CREATE POLICY products_select ON products FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS products_insert ON products;
CREATE POLICY products_insert ON products FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS products_update ON products;
CREATE POLICY products_update ON products FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS products_delete ON products;
CREATE POLICY products_delete ON products FOR DELETE
  USING (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON products;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- taxes
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS taxes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name          text NOT NULL,
  rate          numeric(5,2) NOT NULL DEFAULT 0 CHECK (rate >= 0),
  is_default    boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_taxes_account ON taxes(account_id);

-- One default tax per account, enforced atomically by the DB instead
-- of a client-side "unmark previous default, mark new one" two-step
-- write (which would race between two concurrent admins).
CREATE UNIQUE INDEX IF NOT EXISTS idx_taxes_one_default_per_account
  ON taxes(account_id) WHERE is_default;

ALTER TABLE taxes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS taxes_select ON taxes;
CREATE POLICY taxes_select ON taxes FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS taxes_insert ON taxes;
CREATE POLICY taxes_insert ON taxes FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS taxes_update ON taxes;
CREATE POLICY taxes_update ON taxes FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS taxes_delete ON taxes;
CREATE POLICY taxes_delete ON taxes FOR DELETE
  USING (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON taxes;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON taxes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- billing_counters — per-account, per-document-type sequential
-- numbering (see design notes above)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing_counters (
  account_id    uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  doc_type      text NOT NULL CHECK (doc_type IN ('quote', 'invoice')),
  next_number   integer NOT NULL DEFAULT 1,
  PRIMARY KEY (account_id, doc_type)
);

ALTER TABLE billing_counters ENABLE ROW LEVEL SECURITY;

-- No direct client access — only ever touched via next_billing_number()
-- (SECURITY DEFINER) called from server-side API routes. No policies
-- means no access at all under RLS's deny-by-default.

CREATE OR REPLACE FUNCTION next_billing_number(p_account_id uuid, p_doc_type text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_number integer;
  v_prefix text;
BEGIN
  INSERT INTO billing_counters (account_id, doc_type, next_number)
  VALUES (p_account_id, p_doc_type, 2)
  ON CONFLICT (account_id, doc_type)
    DO UPDATE SET next_number = billing_counters.next_number + 1
  RETURNING next_number - 1 INTO v_number;

  v_prefix := CASE p_doc_type WHEN 'quote' THEN 'COT-' ELSE 'FAC-' END;
  RETURN v_prefix || lpad(v_number::text, 5, '0');
END;
$$;

-- ------------------------------------------------------------
-- quotes (cotizaciones / presupuestos)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quotes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id     uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  deal_id        uuid REFERENCES deals(id) ON DELETE SET NULL,
  quote_number   text NOT NULL,
  status         text NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired', 'converted')),
  issue_date     date NOT NULL DEFAULT CURRENT_DATE,
  expiry_date    date,
  subtotal       numeric(12,2) NOT NULL DEFAULT 0,
  tax_total      numeric(12,2) NOT NULL DEFAULT 0,
  total          numeric(12,2) NOT NULL DEFAULT 0,
  currency       text NOT NULL DEFAULT 'USD',
  notes          text,
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_account_number ON quotes(account_id, quote_number);
CREATE INDEX IF NOT EXISTS idx_quotes_account ON quotes(account_id);
CREATE INDEX IF NOT EXISTS idx_quotes_contact ON quotes(contact_id);

ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quotes_select ON quotes;
CREATE POLICY quotes_select ON quotes FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS quotes_insert ON quotes;
CREATE POLICY quotes_insert ON quotes FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS quotes_update ON quotes;
CREATE POLICY quotes_update ON quotes FOR UPDATE
  USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS quotes_delete ON quotes;
CREATE POLICY quotes_delete ON quotes FOR DELETE
  USING (is_account_member(account_id, 'agent'));

DROP TRIGGER IF EXISTS set_updated_at ON quotes;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- quote_items
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quote_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  quote_id            uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  product_id          uuid REFERENCES products(id) ON DELETE SET NULL,
  description         text NOT NULL,
  quantity            numeric(12,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price          numeric(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  tax_id              uuid REFERENCES taxes(id) ON DELETE SET NULL,
  tax_rate_snapshot   numeric(5,2) NOT NULL DEFAULT 0,
  line_total          numeric(12,2) NOT NULL DEFAULT 0,
  position            integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_account ON quote_items(account_id);

ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quote_items_select ON quote_items;
CREATE POLICY quote_items_select ON quote_items FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS quote_items_insert ON quote_items;
CREATE POLICY quote_items_insert ON quote_items FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS quote_items_update ON quote_items;
CREATE POLICY quote_items_update ON quote_items FOR UPDATE
  USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS quote_items_delete ON quote_items;
CREATE POLICY quote_items_delete ON quote_items FOR DELETE
  USING (is_account_member(account_id, 'agent'));

-- ------------------------------------------------------------
-- invoices (facturas)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id      uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  deal_id         uuid REFERENCES deals(id) ON DELETE SET NULL,
  quote_id        uuid REFERENCES quotes(id) ON DELETE SET NULL,
  invoice_number  text NOT NULL,
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'sent', 'paid', 'partial', 'overdue', 'void')),
  issue_date      date NOT NULL DEFAULT CURRENT_DATE,
  due_date        date,
  subtotal        numeric(12,2) NOT NULL DEFAULT 0,
  tax_total       numeric(12,2) NOT NULL DEFAULT 0,
  total           numeric(12,2) NOT NULL DEFAULT 0,
  -- Maintained exclusively by recompute_invoice_amount_paid() below —
  -- never written directly by application code.
  amount_paid     numeric(12,2) NOT NULL DEFAULT 0,
  currency        text NOT NULL DEFAULT 'USD',
  notes           text,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_account_number ON invoices(account_id, invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_account ON invoices(account_id);
CREATE INDEX IF NOT EXISTS idx_invoices_contact ON invoices(contact_id);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoices_select ON invoices;
CREATE POLICY invoices_select ON invoices FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS invoices_insert ON invoices;
CREATE POLICY invoices_insert ON invoices FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS invoices_update ON invoices;
CREATE POLICY invoices_update ON invoices FOR UPDATE
  USING (is_account_member(account_id, 'agent'));

-- Deleting a financial document is more sensitive than deleting an
-- appointment — admin+ only (vs. agent+ for appointments).
DROP POLICY IF EXISTS invoices_delete ON invoices;
CREATE POLICY invoices_delete ON invoices FOR DELETE
  USING (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON invoices;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- invoice_items
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  invoice_id          uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id          uuid REFERENCES products(id) ON DELETE SET NULL,
  description         text NOT NULL,
  quantity            numeric(12,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price          numeric(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  tax_id              uuid REFERENCES taxes(id) ON DELETE SET NULL,
  tax_rate_snapshot   numeric(5,2) NOT NULL DEFAULT 0,
  line_total          numeric(12,2) NOT NULL DEFAULT 0,
  position            integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_account ON invoice_items(account_id);

ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoice_items_select ON invoice_items;
CREATE POLICY invoice_items_select ON invoice_items FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS invoice_items_insert ON invoice_items;
CREATE POLICY invoice_items_insert ON invoice_items FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS invoice_items_update ON invoice_items;
CREATE POLICY invoice_items_update ON invoice_items FOR UPDATE
  USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS invoice_items_delete ON invoice_items;
CREATE POLICY invoice_items_delete ON invoice_items FOR DELETE
  USING (is_account_member(account_id, 'agent'));

-- ------------------------------------------------------------
-- payments
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  invoice_id    uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount        numeric(12,2) NOT NULL CHECK (amount > 0),
  method        text NOT NULL DEFAULT 'other' CHECK (method IN ('cash', 'card', 'transfer', 'other')),
  paid_at       timestamptz NOT NULL DEFAULT now(),
  notes         text,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_account ON payments(account_id);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payments_select ON payments;
CREATE POLICY payments_select ON payments FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS payments_insert ON payments;
CREATE POLICY payments_insert ON payments FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

-- No UPDATE policy — correcting a payment means deleting and
-- recreating it, which keeps the amount_paid recompute trigger simple
-- and leaves a clean trail (payments aren't clinical records, so full
-- immutability like clinical_notes would be overkill — delete+recreate
-- is enough friction here).
DROP POLICY IF EXISTS payments_delete ON payments;
CREATE POLICY payments_delete ON payments FOR DELETE
  USING (is_account_member(account_id, 'agent'));

-- Full recompute (not incremental — see design notes at top of file).
-- Overpayment (amount_paid > total) is left uncapped on purpose: it's
-- a legitimate signal a bookkeeper may want to see, not an error.
CREATE OR REPLACE FUNCTION recompute_invoice_amount_paid()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_id uuid := COALESCE(NEW.invoice_id, OLD.invoice_id);
  v_paid numeric(12,2);
  v_total numeric(12,2);
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM payments WHERE invoice_id = v_invoice_id;

  SELECT total INTO v_total FROM invoices WHERE id = v_invoice_id;

  UPDATE invoices
  SET amount_paid = v_paid,
      status = CASE
        WHEN v_paid <= 0 THEN status
        WHEN v_paid >= v_total THEN 'paid'
        ELSE 'partial'
      END
  WHERE id = v_invoice_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_recompute_invoice_amount_paid ON payments;
CREATE TRIGGER trg_recompute_invoice_amount_paid
  AFTER INSERT OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION recompute_invoice_amount_paid();
