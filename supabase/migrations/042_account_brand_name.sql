-- ============================================================
-- 042_account_brand_name.sql — let signup seed accounts.name from an
-- explicit brand/clinic name, not just the founder's own full_name.
--
-- Design notes
--   - `accounts.name` already IS the brand identity — it's what an
--     invited teammate joins under (sidebar account strip, invite
--     context, the platform-admin accounts list from 041). The gap
--     was that handle_new_user() only ever seeded it from the
--     signer's personal full_name, and PATCH /api/account (rename)
--     had no UI calling it — so every account was born looking like
--     a person, not a clinic, until someone discovered the settings
--     panel could rename it after the fact.
--   - This migration only touches the DEFAULT at signup time. The
--     signup form now sends an optional `brand_name` alongside
--     `full_name` in the same raw_user_meta_data payload; when
--     present, it wins. When absent (existing behavior, or the
--     invite-flow signup which intentionally hides the field), the
--     fallback chain is unchanged: full_name → email → 'My account'.
--   - No new column — `accounts.name` was always meant to be this;
--     it just needed a proper source at creation time and an editor
--     afterward (the latter shipped in the settings UI alongside
--     this migration, not in SQL).
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name TEXT;
  v_brand_name TEXT;
  v_account_id UUID;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
  v_brand_name := COALESCE(NEW.raw_user_meta_data->>'brand_name', '');

  INSERT INTO public.accounts (name, owner_user_id)
  VALUES (
    COALESCE(NULLIF(v_brand_name, ''), NULLIF(v_full_name, ''), NEW.email, 'My account'),
    NEW.id
  )
  RETURNING id INTO v_account_id;

  INSERT INTO public.profiles (user_id, full_name, email, account_id, account_role)
  VALUES (NEW.id, v_full_name, NEW.email, v_account_id, 'owner');

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to bootstrap account/profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;
