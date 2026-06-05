-- Allinea i nomi dei livelli loyalty al nuovo set usato dall'app:
-- Member / Insider / Elite / VIP (sostituiscono Rookie / Night Explorer / Party Insider / VIP Member).
--
-- Passi:
--  1) backfill dei valori esistenti in profiles.loyalty_level
--  2) nuovo default colonna -> 'Member'
--  3) aggiornamento del trigger update_loyalty_on_booking (CASE)

-- 1) Backfill dei valori esistenti
UPDATE public.profiles SET loyalty_level = 'Member'  WHERE loyalty_level IS NULL OR loyalty_level IN ('Rookie');
UPDATE public.profiles SET loyalty_level = 'Insider' WHERE loyalty_level = 'Night Explorer';
UPDATE public.profiles SET loyalty_level = 'Elite'   WHERE loyalty_level = 'Party Insider';
UPDATE public.profiles SET loyalty_level = 'VIP'     WHERE loyalty_level = 'VIP Member';

-- 2) Nuovo default colonna
ALTER TABLE public.profiles ALTER COLUMN loyalty_level SET DEFAULT 'Member';

-- 3) Aggiornamento trigger: ridefinisce update_loyalty_on_booking() con i nuovi nomi.
--    NOTE: la firma e la logica restano identiche a 20260531_post_review_final.sql;
--    cambia solo il CASE dei livelli e il fallback ('Member' al posto di 'Rookie').
CREATE OR REPLACE FUNCTION public.update_loyalty_on_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  point_value integer := 10;
  total_bookings integer;
BEGIN
  -- INSERT: assegna punti
  IF TG_OP = 'INSERT' AND NEW.status <> 'cancelled' THEN
    UPDATE public.profiles SET loyalty_points = COALESCE(loyalty_points, 0) + point_value
    WHERE id = NEW.user_id;
  -- DELETE: rimuove punti
  ELSIF TG_OP = 'DELETE' AND OLD.status <> 'cancelled' THEN
    UPDATE public.profiles SET loyalty_points = GREATEST(0, COALESCE(loyalty_points, 0) - point_value)
    WHERE id = OLD.user_id;
  -- UPDATE: gestisce passaggio da/verso cancelled
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
      UPDATE public.profiles SET loyalty_points = COALESCE(loyalty_points, 0) + point_value
      WHERE id = NEW.user_id;
    ELSIF OLD.status <> 'cancelled' AND NEW.status = 'cancelled' THEN
      UPDATE public.profiles SET loyalty_points = GREATEST(0, COALESCE(loyalty_points, 0) - point_value)
      WHERE id = NEW.user_id;
    END IF;
  END IF;

  -- Aggiorna loyalty_level basato sui punti
  IF TG_OP <> 'DELETE' THEN
    UPDATE public.profiles SET loyalty_level = CASE
      WHEN loyalty_points >= 1500 THEN 'VIP'
      WHEN loyalty_points >= 600  THEN 'Elite'
      WHEN loyalty_points >= 200  THEN 'Insider'
      ELSE 'Member'
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
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;
