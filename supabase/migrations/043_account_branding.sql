-- ============================================================
-- 043_account_branding.sql — per-account logo + quote customization
--
-- Design notes
--   - `logo_url` replaces the Zentro Med isotipo in that account's own
--     in-app sidebar (white-labeling for that clinic's users) and is
--     reused as the header image on generated quote PDFs — one field,
--     two surfaces, uploaded once from Settings → Overview.
--   - `quote_terms` / `quote_accent_color` only affect the quote PDF
--     (terms & conditions footer, accent color for headers/totals) —
--     edited from Settings → Billing, next to the product/tax catalog
--     that already lives there.
--   - No new Storage bucket: the `chat-media` bucket (023_chat_media.sql)
--     is already public, already account-scoped by RLS, and already
--     allow-lists image/png|jpeg|webp and application/pdf — exactly
--     what logo uploads and generated quote PDFs need. Reusing it
--     avoids a second bucket with a second copy of the same four RLS
--     policies.
-- ============================================================

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS quote_terms TEXT,
  ADD COLUMN IF NOT EXISTS quote_accent_color TEXT;
