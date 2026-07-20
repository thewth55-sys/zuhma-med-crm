-- ============================================================
-- 046_account_address_tax_id.sql — rounds out the account's brand
-- identity (Settings → Resumen, "Marca") with the fields a real quote
-- needs beyond name/logo: postal address and a tax registration
-- number (RFC in Mexico, but kept as a generic free-text field since
-- Zentro Med isn't scoped to one country's tax ID format).
--
-- Both surface on the quote PDF header alongside logo_url/name
-- (043_account_branding.sql) — see quote-pdf-document.tsx.
-- ============================================================

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS tax_id TEXT;
