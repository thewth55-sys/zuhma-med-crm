-- ============================================================
-- 079_handle_new_user_no_oauth_provision.sql
--
-- Zuhma no tiene auto-registro: las cuentas las crea un platform admin
-- (admin.createUser / inviteUserByEmail → provider 'email'). Al habilitar
-- "Login con Google", un correo NUEVO crearía un usuario social y este
-- trigger le armaría una cuenta no deseada.
--
-- Guarda: si el usuario nuevo NO viene por 'email' (p.ej. Google), NO se
-- aprovisiona cuenta. Un usuario ya invitado que entra con Google se
-- ENLAZA a su fila existente (Supabase no inserta una nueva → este
-- trigger ni dispara), así que conserva su cuenta. Un correo social sin
-- cuenta queda sin perfil y /auth/callback lo rechaza y limpia.
--
-- Idempotente (CREATE OR REPLACE).
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
  -- Login social (Google, etc.) de un usuario NUEVO → sin cuenta.
  IF COALESCE(NEW.raw_app_meta_data->>'provider', 'email') <> 'email' THEN
    RETURN NEW;
  END IF;

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
