-- ============================================================
-- whatsapp_config: add an unofficial QR-pairing provider alongside
-- the official Meta Cloud API
--
-- Why this exists:
--   Some clinics resist Meta's business verification for WhatsApp
--   Business API. This adds a second, explicitly UNOFFICIAL way to
--   connect a WhatsApp number: QR pairing (WhatsApp Web multi-device
--   protocol, run by a separate long-running gateway service — see
--   services/wa-qr-gateway/). It carries real ban risk from Meta and
--   is offered under the account's own responsibility; the UI must
--   gate it behind an explicit risk acknowledgment (qr_risk_accepted_at
--   below) before a row can be marked connected.
--
--   The two providers are meant to be able to coexist per account
--   (e.g. keep the official number AND run a second QR-connected
--   number) — that's why this migration widens whatsapp_config from
--   one row per account to one row per (account, provider), rather
--   than adding a "mode" flag to a still-singular row.
--
--   Phase 1 (this migration + the accompanying app code) only wires
--   up ONE active line at a time end-to-end; true simultaneous
--   dual-line routing is Phase 2 (see supabase/migrations/087 for
--   the conversations-side half of that groundwork). This migration
--   alone is backward compatible: every existing row gets
--   provider='cloud_api' and behaves exactly as before.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- 1. provider discriminator. Existing rows are all Cloud API.
ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'cloud_api'
    CHECK (provider IN ('cloud_api', 'qr'));

-- 2. Meta-specific columns become optional — a 'qr' row has neither.
ALTER TABLE whatsapp_config
  ALTER COLUMN phone_number_id DROP NOT NULL,
  ALTER COLUMN access_token DROP NOT NULL;

-- 3. QR-specific columns. All nullable; a 'cloud_api' row leaves
--    these empty.
ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS qr_session_id TEXT,
  ADD COLUMN IF NOT EXISTS qr_auth_state TEXT,
  ADD COLUMN IF NOT EXISTS qr_current_code TEXT,
  ADD COLUMN IF NOT EXISTS qr_code_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS qr_connection_state TEXT
    CHECK (qr_connection_state IN ('idle', 'awaiting_scan', 'connected', 'disconnected', 'logged_out'))
    DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS qr_connected_phone TEXT,
  ADD COLUMN IF NOT EXISTS qr_last_disconnect_reason TEXT,
  ADD COLUMN IF NOT EXISTS qr_risk_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS qr_risk_accepted_by UUID REFERENCES auth.users(id);

-- 4. Replace UNIQUE(account_id) with UNIQUE(account_id, provider) —
--    up to two rows per account (one per provider), not one.
--    PostgreSQL has no "ADD CONSTRAINT IF NOT EXISTS"; guard both
--    directions via pg_constraint so this is safe to re-run.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'whatsapp_config_account_id_key'
      AND conrelid = 'whatsapp_config'::regclass
  ) THEN
    ALTER TABLE whatsapp_config DROP CONSTRAINT whatsapp_config_account_id_key;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'whatsapp_config_account_id_provider_key'
      AND conrelid = 'whatsapp_config'::regclass
  ) THEN
    ALTER TABLE whatsapp_config
      ADD CONSTRAINT whatsapp_config_account_id_provider_key UNIQUE (account_id, provider);
  END IF;
END $$;

-- 5. Cross-field invariant: a cloud_api row must have real Meta
--    credentials; a qr row must have gone through the risk
--    acknowledgment before it can exist at all (the app inserts the
--    row only after that dialog is confirmed — see
--    whatsapp-provider-picker.tsx / POST /api/whatsapp/qr/accept-risk).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'whatsapp_config_provider_fields_check'
      AND conrelid = 'whatsapp_config'::regclass
  ) THEN
    ALTER TABLE whatsapp_config
      ADD CONSTRAINT whatsapp_config_provider_fields_check CHECK (
        (provider = 'cloud_api' AND phone_number_id IS NOT NULL AND access_token IS NOT NULL)
        OR
        (provider = 'qr' AND qr_risk_accepted_at IS NOT NULL)
      );
  END IF;
END $$;

-- 6. Lookup index for the QR gateway resolving its own sessions.
CREATE INDEX IF NOT EXISTS idx_whatsapp_config_qr_session
  ON whatsapp_config(qr_session_id)
  WHERE provider = 'qr';
