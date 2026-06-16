-- ============================================================================
-- Let's Night — 2026-06-16 — Robustezza trigger "side-effect" su bookings
-- ============================================================================
-- #3: i trigger AFTER accessori (loyalty, activity, booked_count) ora hanno un
--     gestore d'eccezione: un loro errore NON deve MAI far fallire (e rimborsare)
--     una prenotazione GIÀ PAGATA. Le guardie BEFORE (capienza/tavoli/immutabilità)
--     e sync_table_aggregates restano severe di proposito.
-- #4: la fedeltà ora tratta 'denied' come 'cancelled' (un ingresso negato/rimborsato
--     non tiene i +10 punti né conta per i traguardi).
-- Logica invariata rispetto all'originale: aggiunti solo EXCEPTION handler e, per
-- la fedeltà, l'inclusione di 'denied'. Idempotente, non tocca dati.
-- ============================================================================

-- #4 + #3 — fedeltà
CREATE OR REPLACE FUNCTION public.update_loyalty_on_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  point_value integer := 10;
  total_bookings integer;
  was_active boolean;
  is_active boolean;
BEGIN
  -- "attiva" = né cancelled né denied (prima contava solo 'cancelled')
  IF TG_OP = 'INSERT' AND NEW.status NOT IN ('cancelled','denied') THEN
    UPDATE public.profiles SET loyalty_points = COALESCE(loyalty_points,0) + point_value WHERE id = NEW.user_id;
  ELSIF TG_OP = 'DELETE' AND OLD.status NOT IN ('cancelled','denied') THEN
    UPDATE public.profiles SET loyalty_points = GREATEST(0, COALESCE(loyalty_points,0) - point_value) WHERE id = OLD.user_id;
  ELSIF TG_OP = 'UPDATE' THEN
    was_active := OLD.status NOT IN ('cancelled','denied');
    is_active  := NEW.status NOT IN ('cancelled','denied');
    IF NOT was_active AND is_active THEN
      UPDATE public.profiles SET loyalty_points = COALESCE(loyalty_points,0) + point_value WHERE id = NEW.user_id;
    ELSIF was_active AND NOT is_active THEN
      UPDATE public.profiles SET loyalty_points = GREATEST(0, COALESCE(loyalty_points,0) - point_value) WHERE id = NEW.user_id;
    END IF;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    UPDATE public.profiles SET loyalty_level = CASE
      WHEN loyalty_points >= 1500 THEN 'VIP'
      WHEN loyalty_points >= 600  THEN 'Elite'
      WHEN loyalty_points >= 200  THEN 'Insider'
      ELSE 'Member'
    END WHERE id = NEW.user_id;

    SELECT COUNT(*) INTO total_bookings
    FROM public.bookings
    WHERE user_id = NEW.user_id AND status NOT IN ('cancelled','denied');

    IF total_bookings >= 1 THEN
      INSERT INTO public.user_milestones (user_id, milestone_id, progress, unlocked_at)
      VALUES (NEW.user_id, 'first_booking', 1, now())
      ON CONFLICT (user_id, milestone_id) DO UPDATE SET
        progress = 1,
        unlocked_at = COALESCE(user_milestones.unlocked_at, now());
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RETURN COALESCE(NEW, OLD);  -- la fedeltà non blocca mai la prenotazione
END;
$$;

-- #3 — feed attività
CREATE OR REPLACE FUNCTION public.create_activity_on_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_privacy jsonb;
  vis text := 'public';
BEGIN
  IF NEW.status IN ('cancelled','denied') THEN RETURN NEW; END IF;

  SELECT privacy_settings INTO user_privacy FROM public.profiles WHERE id = NEW.user_id;
  IF user_privacy IS NOT NULL THEN
    IF (user_privacy->>'show_future_events')::boolean IS FALSE THEN vis := 'private'; END IF;
    IF user_privacy->>'profile_visibility' = 'followers' THEN vis := 'followers'; END IF;
    IF user_privacy->>'profile_visibility' = 'private' THEN vis := 'private'; END IF;
  END IF;

  INSERT INTO public.activities (user_id, type, event_id, visibility)
  VALUES (NEW.user_id, 'booking_made', NEW.event_id, vis);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;  -- il feed attività non blocca mai la prenotazione
END;
$$;

-- #3 — contatore posti (logica invariata: già esclude tavoli e denied)
CREATE OR REPLACE FUNCTION public.update_event_booked_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE affected_event uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN affected_event := OLD.event_id;
  ELSE affected_event := NEW.event_id; END IF;
  UPDATE public.events SET booked_count = (
    SELECT COALESCE(SUM(quantity), 0) FROM public.bookings
    WHERE event_id = affected_event
      AND status NOT IN ('cancelled', 'denied')
      AND COALESCE(booking_type, 'ticket') NOT IN ('table', 'table_share')
      AND table_id IS NULL
  ) WHERE id = affected_event;
  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RETURN COALESCE(NEW, OLD);  -- il contatore non blocca mai la prenotazione
END;
$$;
