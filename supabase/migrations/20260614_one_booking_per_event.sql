-- ============================================================================
-- Let's Night — 2026-06-14 — UNA PRENOTAZIONE PER EVENTO + notifiche migliori
-- ============================================================================
-- 1) Una sola prenotazione ATTIVA per (utente, evento), qualunque tipo: blocca
--    "ingresso + tavolo" (e viceversa) sullo stesso evento. Prima i due UNIQUE
--    erano separati (ingresso con table_id NULL / tavolo per table_id) → si
--    poteva avere entrambi. Ora un solo UNIQUE (user_id, event_id) attivo.
-- 2) Dedup dei doppioni esistenti PRIMA di creare l'indice: per ogni
--    (utente, evento) si tiene UNA prenotazione (preferendo il tavolo, che
--    include l'ingresso; poi la più recente), il resto → 'cancelled'.
-- 3) notifications.booking_id → la notifica "prenotazione confermata" punta al
--    BIGLIETTO (QR), non alla pagina evento. + testo notifiche migliorato.
-- Idempotente.
-- ============================================================================

-- 1+2) Dedup: tieni una sola prenotazione attiva per (utente, evento)
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY user_id, event_id
    ORDER BY (table_id IS NOT NULL) DESC, created_at DESC
  ) AS rn
  FROM public.bookings
  WHERE status NOT IN ('cancelled','denied')
)
UPDATE public.bookings b
SET status = 'cancelled', qr_code = NULL
FROM ranked r
WHERE b.id = r.id AND r.rn > 1;

-- Sostituisci i due UNIQUE separati con uno solo (user, event) attivo
DROP INDEX IF EXISTS public.bookings_user_event_active_unique;
DROP INDEX IF EXISTS public.bookings_user_table_active_unique;
CREATE UNIQUE INDEX bookings_user_event_active_unique
  ON public.bookings (user_id, event_id)
  WHERE status NOT IN ('cancelled','denied');

-- 3) Notifica → punta al biglietto + testo migliore
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.notify_on_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ev_title text;
  ev_date  date;
  booker_name text;
  notify_followers boolean;
  show_future boolean;
  is_table boolean;
BEGIN
  IF NEW.status <> 'confirmed' THEN RETURN NEW; END IF;
  IF coalesce(NEW.booking_type, 'ticket') NOT IN ('ticket','table','table_share') THEN RETURN NEW; END IF;

  SELECT e.title, e.event_date INTO ev_title, ev_date FROM events e WHERE e.id = NEW.event_id;
  IF ev_title IS NULL THEN RETURN NEW; END IF;
  IF ev_date < current_date THEN RETURN NEW; END IF;

  is_table := (NEW.booking_type = 'table_share') OR (NEW.table_id IS NOT NULL);

  -- (a) conferma al prenotante → punta al BIGLIETTO (booking_id)
  INSERT INTO notifications (user_id, type, title, body, event_id, booking_id)
  VALUES (
    NEW.user_id, 'booking_confirmed',
    CASE WHEN is_table THEN 'Tavolo confermato' ELSE 'Ingresso confermato' END,
    ev_title || ' · ' || to_char(ev_date, 'DD/MM') || ' — il tuo QR è pronto',
    NEW.event_id, NEW.id
  );

  -- (b) fan-out ai follower, gated dalla privacy del prenotante
  SELECT coalesce((p.privacy_settings->>'notify_followers_on_booking')::boolean, false),
         coalesce((p.privacy_settings->>'show_future_events')::boolean, true)
    INTO notify_followers, show_future
  FROM profiles p WHERE p.id = NEW.user_id;

  IF notify_followers AND show_future THEN
    SELECT coalesce(display_name, full_name, 'Un amico') INTO booker_name FROM profiles WHERE id = NEW.user_id;
    INSERT INTO notifications (user_id, type, title, body, actor_id, event_id)
    SELECT f.follower_id, 'friend_booking',
           booker_name || ' esce',
           'Va a ' || ev_title || ' (' || to_char(ev_date, 'DD/MM') || ') — prenota anche tu',
           NEW.user_id, NEW.event_id
    FROM follows f
    WHERE f.following_id = NEW.user_id;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;  -- una notifica non deve MAI far fallire la prenotazione
END; $$;
