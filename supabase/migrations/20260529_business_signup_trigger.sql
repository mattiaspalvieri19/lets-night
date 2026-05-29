-- Trigger che crea automaticamente profile + venue (se business)
-- al momento della creazione dell'utente auth, leggendo i dati dal user_metadata.
-- Necessario perché con email confirmation attiva auth.uid() e' null durante
-- la signUp, quindi le RLS bloccano gli INSERT lato client.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta jsonb := NEW.raw_user_meta_data;
  user_role text := COALESCE(meta->>'role', 'user');
BEGIN
  -- Crea/aggiorna profilo (sempre)
  INSERT INTO public.profiles (id, full_name, role, phone, city, birth_date)
  VALUES (
    NEW.id,
    meta->>'full_name',
    user_role,
    meta->>'phone',
    meta->>'city',
    CASE WHEN meta ? 'birth_date' THEN (meta->>'birth_date')::date ELSE NULL END
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    role = EXCLUDED.role,
    phone = COALESCE(EXCLUDED.phone, profiles.phone),
    city = COALESCE(EXCLUDED.city, profiles.city),
    birth_date = COALESCE(EXCLUDED.birth_date, profiles.birth_date);

  -- Se l'utente e' un business e ha passato i dati venue, crea anche la venue
  IF user_role = 'business' AND meta ? 'venue_name' THEN
    INSERT INTO public.venues (
      owner_id, name, category, city, zona, address, phone, description, contact_email, is_verified
    ) VALUES (
      NEW.id,
      meta->>'venue_name',
      COALESCE(meta->>'venue_category', 'Discoteca'),
      COALESCE(meta->>'venue_city', 'Milano'),
      meta->>'venue_zona',
      meta->>'venue_address',
      meta->>'venue_phone',
      meta->>'venue_description',
      NEW.email,
      false
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
