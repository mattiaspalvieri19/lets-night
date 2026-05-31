-- =========================================================
-- POST-REVIEW FINAL HARDENING (2026-05-31)
-- Fix dei 5 finding critici emersi dall'ultrareview finale:
-- 1. Policy profiles SELECT pubblica per utenti searchable
-- 2. Trigger loyalty points + sblocco milestones su booking
-- 3. Trigger activities su booking + milestone unlock
-- 4. RPC check_username_available (analoga phone)
-- 5. Backfill privacy_settings per utenti pre-migration
-- =========================================================

-- ---------------------------------------------------------
-- 1. POLICY: anyone can view searchable profiles
-- ---------------------------------------------------------
-- Senza questa, la sezione Cerca utenti ritorna 0 righe per
-- chiunque non sia il proprietario del profilo.

DROP POLICY IF EXISTS "Anyone can view searchable profiles" ON public.profiles;
CREATE POLICY "Anyone can view searchable profiles"
  ON public.profiles
  FOR SELECT
  TO anon, authenticated
  USING (
    -- Default: visibile a meno che searchable sia esplicitamente false
    COALESCE((privacy_settings->>'searchable')::boolean, true) IS NOT FALSE
  );

-- ---------------------------------------------------------
-- 2. BACKFILL: utenti pre-migration con privacy_settings NULL
-- ---------------------------------------------------------
UPDATE public.profiles
SET privacy_settings = '{
  "searchable": true,
  "profile_visibility": "public",
  "show_future_events": true,
  "show_past_events": true,
  "show_photos": true,
  "show_badges": true,
  "show_favorite_venues": true,
  "show_followers": true,
  "show_following": true
}'::jsonb
WHERE privacy_settings IS NULL;

-- ---------------------------------------------------------
-- 3. RPC check_username_available (analoga check_phone)
-- ---------------------------------------------------------
-- Necessario perche le RLS bloccano SELECT cross-user.
-- Il client da solo non puo verificare unicita.

CREATE OR REPLACE FUNCTION public.check_username_available(p_username text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_username IS NULL OR p_username = '' THEN
    RETURN true;
  END IF;
  RETURN NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE LOWER(username) = LOWER(p_username)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_username_available(text) TO anon, authenticated;

-- ---------------------------------------------------------
-- 4. LOYALTY: trigger su bookings per assegnare punti
-- ---------------------------------------------------------
-- Ogni booking confirmed assegna 50 punti.
-- Cancellare il booking rimuove i punti.

CREATE OR REPLACE FUNCTION public.update_loyalty_on_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  point_value integer := 50;
  total_bookings integer;
  user_city text;
  event_city text;
  cities_count integer;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status <> 'cancelled' THEN
    UPDATE public.profiles SET loyalty_points = COALESCE(loyalty_points, 0) + point_value
      WHERE id = NEW.user_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.status <> 'cancelled' AND NEW.status = 'cancelled' THEN
    UPDATE public.profiles SET loyalty_points = GREATEST(0, COALESCE(loyalty_points, 0) - point_value)
      WHERE id = NEW.user_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
    UPDATE public.profiles SET loyalty_points = COALESCE(loyalty_points, 0) + point_value
      WHERE id = NEW.user_id;
  ELSIF TG_OP = 'DELETE' AND OLD.status <> 'cancelled' THEN
    UPDATE public.profiles SET loyalty_points = GREATEST(0, COALESCE(loyalty_points, 0) - point_value)
      WHERE id = OLD.user_id;
  END IF;

  -- Aggiorna loyalty_level basato sui punti
  IF TG_OP <> 'DELETE' THEN
    UPDATE public.profiles SET loyalty_level = CASE
      WHEN loyalty_points >= 1500 THEN 'VIP Member'
      WHEN loyalty_points >= 600 THEN 'Party Insider'
      WHEN loyalty_points >= 200 THEN 'Night Explorer'
      ELSE 'Rookie'
    END WHERE id = NEW.user_id;

    -- Sblocca milestones rilevanti
    SELECT COUNT(*) INTO total_bookings
    FROM public.bookings
    WHERE user_id = NEW.user_id AND status <> 'cancelled';

    -- first_booking
    IF total_bookings >= 1 THEN
      INSERT INTO public.user_milestones (user_id, milestone_id, progress, unlocked_at)
      VALUES (NEW.user_id, 'first_booking', 1, now())
      ON CONFLICT (user_id, milestone_id) DO UPDATE SET
        progress = 1,
        unlocked_at = COALESCE(user_milestones.unlocked_at, now());
    END IF;

    -- five_bookings
    IF total_bookings >= 5 THEN
      INSERT INTO public.user_milestones (user_id, milestone_id, progress, unlocked_at)
      VALUES (NEW.user_id, 'five_bookings', total_bookings, now())
      ON CONFLICT (user_id, milestone_id) DO UPDATE SET
        progress = total_bookings,
        unlocked_at = COALESCE(user_milestones.unlocked_at, now());
    ELSE
      INSERT INTO public.user_milestones (user_id, milestone_id, progress)
      VALUES (NEW.user_id, 'five_bookings', total_bookings)
      ON CONFLICT (user_id, milestone_id) DO UPDATE SET progress = total_bookings;
    END IF;

    -- ten_bookings
    IF total_bookings >= 10 THEN
      INSERT INTO public.user_milestones (user_id, milestone_id, progress, unlocked_at)
      VALUES (NEW.user_id, 'ten_bookings', total_bookings, now())
      ON CONFLICT (user_id, milestone_id) DO UPDATE SET
        progress = total_bookings,
        unlocked_at = COALESCE(user_milestones.unlocked_at, now());
    ELSE
      INSERT INTO public.user_milestones (user_id, milestone_id, progress)
      VALUES (NEW.user_id, 'ten_bookings', total_bookings)
      ON CONFLICT (user_id, milestone_id) DO UPDATE SET progress = total_bookings;
    END IF;

    -- city explorers (milano_explorer / roma_explorer)
    SELECT COUNT(*) INTO cities_count
    FROM public.bookings b
    JOIN public.events e ON e.id = b.event_id
    JOIN public.venues v ON v.id = e.venue_id
    WHERE b.user_id = NEW.user_id AND b.status <> 'cancelled' AND v.city = 'Milano';
    IF cities_count >= 5 THEN
      INSERT INTO public.user_milestones (user_id, milestone_id, progress, unlocked_at)
      VALUES (NEW.user_id, 'milano_explorer', cities_count, now())
      ON CONFLICT (user_id, milestone_id) DO UPDATE SET
        progress = cities_count,
        unlocked_at = COALESCE(user_milestones.unlocked_at, now());
    ELSE
      INSERT INTO public.user_milestones (user_id, milestone_id, progress)
      VALUES (NEW.user_id, 'milano_explorer', cities_count)
      ON CONFLICT (user_id, milestone_id) DO UPDATE SET progress = cities_count;
    END IF;

    SELECT COUNT(*) INTO cities_count
    FROM public.bookings b
    JOIN public.events e ON e.id = b.event_id
    JOIN public.venues v ON v.id = e.venue_id
    WHERE b.user_id = NEW.user_id AND b.status <> 'cancelled' AND v.city = 'Roma';
    IF cities_count >= 5 THEN
      INSERT INTO public.user_milestones (user_id, milestone_id, progress, unlocked_at)
      VALUES (NEW.user_id, 'roma_explorer', cities_count, now())
      ON CONFLICT (user_id, milestone_id) DO UPDATE SET
        progress = cities_count,
        unlocked_at = COALESCE(user_milestones.unlocked_at, now());
    ELSE
      INSERT INTO public.user_milestones (user_id, milestone_id, progress)
      VALUES (NEW.user_id, 'roma_explorer', cities_count)
      ON CONFLICT (user_id, milestone_id) DO UPDATE SET progress = cities_count;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS bookings_loyalty_update ON public.bookings;
CREATE TRIGGER bookings_loyalty_update
  AFTER INSERT OR UPDATE OR DELETE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_loyalty_on_booking();

-- ---------------------------------------------------------
-- 5. ACTIVITIES: trigger su bookings AFTER INSERT
-- ---------------------------------------------------------
-- Crea activity di tipo 'booking_made' con visibility public di default.

CREATE OR REPLACE FUNCTION public.create_activity_on_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_privacy jsonb;
  vis text := 'public';
BEGIN
  IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;

  SELECT privacy_settings INTO user_privacy FROM public.profiles WHERE id = NEW.user_id;
  IF user_privacy IS NOT NULL THEN
    IF (user_privacy->>'show_future_events')::boolean IS FALSE THEN vis := 'private'; END IF;
    IF user_privacy->>'profile_visibility' = 'followers' THEN vis := 'followers'; END IF;
    IF user_privacy->>'profile_visibility' = 'private' THEN vis := 'private'; END IF;
  END IF;

  INSERT INTO public.activities (user_id, type, event_id, visibility)
  VALUES (NEW.user_id, 'booking_made', NEW.event_id, vis);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_create_activity ON public.bookings;
CREATE TRIGGER bookings_create_activity
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.create_activity_on_booking();

-- ---------------------------------------------------------
-- 6. ACTIVITIES: trigger su user_milestones unlock
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_activity_on_milestone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_privacy jsonb;
  vis text := 'public';
BEGIN
  IF NEW.unlocked_at IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.unlocked_at IS NOT NULL THEN RETURN NEW; END IF;

  SELECT privacy_settings INTO user_privacy FROM public.profiles WHERE id = NEW.user_id;
  IF user_privacy IS NOT NULL THEN
    IF (user_privacy->>'show_badges')::boolean IS FALSE THEN vis := 'private'; END IF;
    IF user_privacy->>'profile_visibility' = 'followers' THEN vis := 'followers'; END IF;
    IF user_privacy->>'profile_visibility' = 'private' THEN vis := 'private'; END IF;
  END IF;

  INSERT INTO public.activities (user_id, type, milestone_id, visibility)
  VALUES (NEW.user_id, 'badge_unlocked', NEW.milestone_id, vis);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_milestones_create_activity ON public.user_milestones;
CREATE TRIGGER user_milestones_create_activity
  AFTER INSERT OR UPDATE ON public.user_milestones
  FOR EACH ROW EXECUTE FUNCTION public.create_activity_on_milestone();

-- ---------------------------------------------------------
-- 7. ACTIVITIES: trigger su favorite_venues
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_activity_on_favorite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_privacy jsonb;
  vis text := 'public';
  total_favs integer;
BEGIN
  SELECT privacy_settings INTO user_privacy FROM public.profiles WHERE id = NEW.user_id;
  IF user_privacy IS NOT NULL THEN
    IF (user_privacy->>'show_favorite_venues')::boolean IS FALSE THEN vis := 'private'; END IF;
    IF user_privacy->>'profile_visibility' = 'followers' THEN vis := 'followers'; END IF;
    IF user_privacy->>'profile_visibility' = 'private' THEN vis := 'private'; END IF;
  END IF;

  INSERT INTO public.activities (user_id, type, venue_id, visibility)
  VALUES (NEW.user_id, 'venue_favorited', NEW.venue_id, vis);

  -- first_favorite milestone
  SELECT COUNT(*) INTO total_favs FROM public.favorite_venues WHERE user_id = NEW.user_id;
  IF total_favs >= 1 THEN
    INSERT INTO public.user_milestones (user_id, milestone_id, progress, unlocked_at)
    VALUES (NEW.user_id, 'first_favorite', 1, now())
    ON CONFLICT (user_id, milestone_id) DO UPDATE SET
      progress = 1,
      unlocked_at = COALESCE(user_milestones.unlocked_at, now());

    -- + bonus 20 punti per first_favorite
    UPDATE public.profiles SET loyalty_points = COALESCE(loyalty_points, 0) + 20
      WHERE id = NEW.user_id
      AND NOT EXISTS (
        SELECT 1 FROM public.activities WHERE user_id = NEW.user_id
        AND type = 'badge_unlocked' AND milestone_id = 'first_favorite'
      );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS favorites_create_activity ON public.favorite_venues;
CREATE TRIGGER favorites_create_activity
  AFTER INSERT ON public.favorite_venues
  FOR EACH ROW EXECUTE FUNCTION public.create_activity_on_favorite();
