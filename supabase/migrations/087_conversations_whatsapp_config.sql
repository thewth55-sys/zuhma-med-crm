-- ============================================================
-- conversations: track which whatsapp_config (which line) a
-- conversation belongs to
--
-- Why this exists:
--   Part 2 of the QR-pairing groundwork (see 086_whatsapp_qr_provider.sql).
--   whatsapp_config can now hold up to two rows per account (Cloud
--   API + QR), but conversations has no concept of "which number did
--   this thread come in on" — findOrCreateConversation matches purely
--   on (account_id, contact_id). Once an account might have two live
--   WhatsApp lines, that's not safe: a reply has to go out on the
--   SAME line the patient is talking to, not whichever line the
--   account happens to have.
--
--   This migration only adds the column and backfills it — it does
--   NOT change any runtime behavior by itself. Every account today
--   has at most one whatsapp_config row, so the backfill is
--   unambiguous. The application-code change that actually starts
--   keying findOrCreateConversation by (account_id, contact_id,
--   whatsapp_config_id) ships in the same PR as this migration, but
--   the column is nullable specifically so this migration is safe to
--   run independently and so demo accounts / accounts with no
--   WhatsApp configured yet aren't broken.
--
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS whatsapp_config_id UUID REFERENCES whatsapp_config(id) ON DELETE SET NULL;

-- Backfill: every account with exactly one whatsapp_config row today
-- (the only case that exists pre-QR) gets all its conversations
-- pointed at that row. Accounts with zero rows (no WhatsApp
-- configured, or demo accounts) are left NULL — nothing to point at.
UPDATE conversations c
SET whatsapp_config_id = wc.id
FROM whatsapp_config wc
WHERE c.account_id = wc.account_id
  AND c.whatsapp_config_id IS NULL
  AND (SELECT count(*) FROM whatsapp_config wc2 WHERE wc2.account_id = c.account_id) = 1;

CREATE INDEX IF NOT EXISTS idx_conversations_whatsapp_config
  ON conversations(whatsapp_config_id);
