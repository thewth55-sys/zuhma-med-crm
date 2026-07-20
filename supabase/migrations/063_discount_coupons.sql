-- ============================================================
-- 063_discount_coupons.sql
--
-- Local mirror of Stripe Coupon + Promotion Code pairs a platform
-- admin creates for courtesies/discounts (/admin/coupons). Stripe
-- itself is the source of truth for redemption state — this table
-- exists so the admin UI has something to list without an extra
-- Stripe API round trip per page load, and so "who created this and
-- why" (the internal `description`) lives somewhere other than a
-- Stripe dashboard note.
--
-- Mirrors platform_admin_audit_log's RLS shape: written exclusively
-- via the service-role client from /api/platform-admin/coupons,
-- read-only for platform admins.
-- ============================================================

CREATE TABLE IF NOT EXISTS discount_coupons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  stripe_coupon_id TEXT NOT NULL,
  stripe_promotion_code_id TEXT NOT NULL,
  percent_off NUMERIC,
  amount_off_cents INTEGER,
  currency TEXT,
  duration TEXT NOT NULL CHECK (duration IN ('once', 'repeating', 'forever')),
  duration_in_months INTEGER,
  max_redemptions INTEGER,
  expires_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discount_coupons_created ON discount_coupons(created_at DESC);

ALTER TABLE discount_coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS discount_coupons_select ON discount_coupons;
CREATE POLICY discount_coupons_select ON discount_coupons FOR SELECT
  USING (is_platform_admin());
