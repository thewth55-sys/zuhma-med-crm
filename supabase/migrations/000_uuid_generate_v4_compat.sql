-- ============================================================
-- 000_uuid_generate_v4_compat.sql — fixes "function uuid_generate_v4()
-- does not exist" on fresh Supabase projects.
--
-- New Supabase projects pre-install the `uuid-ossp` extension into
-- the `extensions` schema, not `public`. Every historical migration
-- from 001 onward calls the bare, unqualified `uuid_generate_v4()`
-- (assuming it lives in `public`, which was true on older projects).
-- Rather than editing 60+ historical migration files to schema-qualify
-- every call, this defines a thin `public.uuid_generate_v4()` wrapper
-- that delegates to wherever the real extension function actually
-- lives — found dynamically, so this works whether that's
-- `extensions` (current Supabase default), `public` (older projects,
-- where this is a harmless no-op), or anywhere else.
--
-- Must sort before 001 (hence "000") since 001 calls
-- uuid_generate_v4() on its very first CREATE TABLE.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

DO $$
DECLARE
  v_schema text;
BEGIN
  SELECT n.nspname INTO v_schema
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'uuid_generate_v4'
  ORDER BY (n.nspname = 'public') DESC
  LIMIT 1;

  IF v_schema IS NULL THEN
    -- Extension isn't installed anywhere yet (unexpected on Supabase,
    -- but handle it) — install it into `extensions`, matching current
    -- Supabase platform convention.
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
    v_schema := 'extensions';
  END IF;

  IF v_schema <> 'public' THEN
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION public.uuid_generate_v4() RETURNS uuid LANGUAGE sql VOLATILE AS $f$ SELECT %I.uuid_generate_v4() $f$',
      v_schema
    );
  END IF;
END $$;
