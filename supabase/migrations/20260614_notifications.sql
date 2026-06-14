-- ============================================================================
-- Let's Night — 2026-06-14 — CENTRO NOTIFICHE (persistenza via trigger)
-- Tabella notifiche + RLS + trigger affidabili (in transazione con booking/follow,
-- catturano ogni insert client o server). Push (app chiusa) sarà un fast-follow
-- via webhook DB → Edge Function. Idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,  -- destinatario
  type       text NOT NULL CHECK (type IN ('booking_confirmed','follow','friend_booking','reminder','generic')),
  title      text NOT NULL,
  body       text,
  actor_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,           -- chi l'ha generata
  event_id   uuid REFERENCES public.events(id) ON DELETE CASCADE,
  read       boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON public.notifications(user_id) WHERE read = false;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Vedi solo le TUE; segna lette / elimina solo le tue. INSERT solo server-side
-- (i trigger sono SECURITY DEFINER): nessuna policy INSERT → il client non può crearle.
DROP POLICY IF EXISTS "Users read own notifications" ON public.notifications;
CREATE POLICY "Users read own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own notifications" ON public.notifications;
CREATE POLICY "Users delete own notifications" ON public.notifications
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Trigger: nuovo follower → notifica al seguito
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_follow()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor_name text;
BEGIN
  SELECT coalesce(display_name, full_name, 'Qualcuno') INTO actor_name FROM profiles WHERE id = NEW.follower_id;
  INSERT INTO notifications (user_id, type, title, body, actor_id)
  VALUES (NEW.following_id, 'follow', 'Nuovo follower', actor_name || ' ha iniziato a seguirti', NEW.follower_id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;  -- una notifica non deve MAI far fallire il follow
END; $$;

DROP TRIGGER IF EXISTS trg_notify_on_follow ON public.follows;
CREATE TRIGGER trg_notify_on_follow AFTER INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_follow();

-- ----------------------------------------------------------------------------
-- Trigger: nuova prenotazione → conferma al prenotante + fan-out ai follower
-- (gated dalla privacy: notify_followers_on_booking = true E show_future_events = true)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ev_title text;
  ev_date  date;
  booker_name text;
  notify_followers boolean;
  show_future boolean;
BEGIN
  IF NEW.status <> 'confirmed' THEN RETURN NEW; END IF;
  IF coalesce(NEW.booking_type, 'ticket') NOT IN ('ticket','table','table_share') THEN RETURN NEW; END IF;

  SELECT e.title, e.event_date INTO ev_title, ev_date FROM events e WHERE e.id = NEW.event_id;
  IF ev_title IS NULL THEN RETURN NEW; END IF;          -- evento mancante
  IF ev_date < current_date THEN RETURN NEW; END IF;    -- solo eventi futuri

  -- (a) conferma al prenotante
  INSERT INTO notifications (user_id, type, title, body, event_id)
  VALUES (NEW.user_id, 'booking_confirmed', 'Prenotazione confermata', ev_title, NEW.event_id);

  -- (b) privacy del prenotante
  SELECT coalesce((p.privacy_settings->>'notify_followers_on_booking')::boolean, false),
         coalesce((p.privacy_settings->>'show_future_events')::boolean, true)
    INTO notify_followers, show_future
  FROM profiles p WHERE p.id = NEW.user_id;

  IF notify_followers AND show_future THEN
    SELECT coalesce(display_name, full_name, 'Un amico') INTO booker_name FROM profiles WHERE id = NEW.user_id;
    INSERT INTO notifications (user_id, type, title, body, actor_id, event_id)
    SELECT f.follower_id, 'friend_booking',
           booker_name || ' esce stasera',
           booker_name || ' ha prenotato ' || ev_title || ' — prenota anche tu',
           NEW.user_id, NEW.event_id
    FROM follows f
    WHERE f.following_id = NEW.user_id;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;  -- una notifica non deve MAI far fallire la prenotazione
END; $$;

DROP TRIGGER IF EXISTS trg_notify_on_booking ON public.bookings;
CREATE TRIGGER trg_notify_on_booking AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_booking();

REVOKE EXECUTE ON FUNCTION public.notify_on_follow() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_booking() FROM PUBLIC, anon, authenticated;
