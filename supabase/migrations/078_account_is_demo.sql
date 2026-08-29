-- ============================================================
-- 078_account_is_demo.sql — marca de cuenta demo.
--
-- Habilita el "simulador de cliente" para demos de ventas: cuando una
-- cuenta es demo, el envío saliente (sendMessageToConversation) NO llama
-- a Meta — persiste el mensaje localmente para que la conversación fluya
-- en vivo por el pipeline real sin un número de WhatsApp conectado.
--
-- Aísla producción: las cuentas reales (is_demo = false) no cambian en
-- nada su comportamiento de envío.
--
-- Idempotente.
-- ============================================================

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

-- Backfill de cuentas demo ya creadas (identificadas por la etiqueta "Demo").
UPDATE accounts SET is_demo = true
WHERE is_demo = false
  AND id IN (SELECT account_id FROM account_tags WHERE label = 'Demo');
