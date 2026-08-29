-- ============================================================
-- 085_debrand_plan_values.sql — collapse legacy plan-tier values.
--
-- Zuhma Med CRM has a single open plan with no tiers. Any account that
-- still carries a legacy bundle value is moved to 'standalone', and the
-- CHECK constraint is narrowed to the two neutral values the app knows
-- (`trial`, `standalone`) — matching the `Plan` type in
-- src/lib/accounts/plans.ts.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

UPDATE public.accounts
   SET plan = 'standalone'
 WHERE plan NOT IN ('trial', 'standalone');

ALTER TABLE public.accounts
  DROP CONSTRAINT IF EXISTS accounts_plan_check;

ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_plan_check
  CHECK (plan IN ('trial', 'standalone'));
