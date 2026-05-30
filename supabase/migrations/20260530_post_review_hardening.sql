-- =========================================================
-- POST-REVIEW HARDENING (2026-05-30)
-- Fix di sicurezza, integrita dati e performance emersi dalla
-- 3a ultrareview multi-agente.
-- =========================================================

-- ---------------------------------------------------------
-- 1. RPC: check_phone_available
-- ---------------------------------------------------------
-- Le RLS su profiles bloccano la SELECT per utenti non autenticati.
-- Il pre-check phone lato client passava sempre (silent always-pass).
-- Questa RPC bypassa RLS via SECURITY DEFINER e ritorna true/false.

CREATE OR REPLACE FUNCTION public.check_phone_available(p_phone text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_phone IS NULL OR p_phone = '' THEN
    RETURN true;
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE phone = p_phone) THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM public.venues WHERE phone = p_phone) THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_phone_available(text) TO anon, authenticated;

-- ---------------------------------------------------------
-- 2. UNIQUE bookings (user_id, event_id) per non-cancelled
-- ---------------------------------------------------------
-- Evita doppia prenotazione dello stesso utente per lo stesso evento
-- via race condition (controllo client-side non atomico).

CREATE UNIQUE INDEX IF NOT EXISTS bookings_user_event_active_unique
  ON public.bookings (user_id, event_id)
  WHERE status <> 'cancelled';

-- ---------------------------------------------------------
-- 3. UNIQUE bookings.qr_code
-- ---------------------------------------------------------
-- Evita ambiguita allo scanner se per qualsiasi motivo due bookings
-- finissero con lo stesso QR (improbabile ma fail-safe).

CREATE UNIQUE INDEX IF NOT EXISTS bookings_qr_code_unique
  ON public.bookings (qr_code)
  WHERE qr_code IS NOT NULL;

-- ---------------------------------------------------------
-- 4. Trigger: update events.booked_count
-- ---------------------------------------------------------
-- booked_count attualmente non viene mai aggiornato dall'app.
-- availableSpots mostrato sul sito e sempre stantio.

CREATE OR REPLACE FUNCTION public.update_event_booked_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_event uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    affected_event := OLD.event_id;
  ELSE
    affected_event := NEW.event_id;
  END IF;

  UPDATE public.events
  SET booked_count = (
    SELECT COALESCE(SUM(quantity), 0)
    FROM public.bookings
    WHERE event_id = affected_event AND status <> 'cancelled'
  )
  WHERE id = affected_event;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS bookings_after_change ON public.bookings;
CREATE TRIGGER bookings_after_change
  AFTER INSERT OR UPDATE OR DELETE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_event_booked_count();

-- Backfill iniziale (utile per dati gia esistenti)
UPDATE public.events e SET booked_count = COALESCE((
  SELECT SUM(quantity) FROM public.bookings b
  WHERE b.event_id = e.id AND b.status <> 'cancelled'
), 0);

-- ---------------------------------------------------------
-- 5. Cleanup policy duplicate su bookings
-- ---------------------------------------------------------
-- Esistono 2 policy SELECT per venue owner (TO public + TO authenticated).
-- La nuova TO authenticated copre tutto, droppo la vecchia.

DROP POLICY IF EXISTS "Venue owners can view event bookings" ON public.bookings;

-- ---------------------------------------------------------
-- 6. Profile visibility: escludere bookings cancelled
-- ---------------------------------------------------------
-- Privacy: chi cancella la prenotazione non vuole che il locale
-- continui a vedere il suo profilo.

DROP POLICY IF EXISTS "Venue owners can view bookers profiles" ON public.profiles;

CREATE POLICY "Venue owners can view bookers profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT b.user_id FROM bookings b
      JOIN events e ON e.id = b.event_id
      JOIN venues v ON v.id = e.venue_id
      WHERE v.owner_id = auth.uid()
        AND b.status <> 'cancelled'
    )
    OR auth.uid() IN (SELECT user_id FROM admins)
  );

-- ---------------------------------------------------------
-- 7. scraping_sources: usa tabella admins invece di email hardcoded
-- ---------------------------------------------------------

DROP POLICY IF EXISTS "Only admin can manage sources" ON public.scraping_sources;

CREATE POLICY "Admins can manage scraping sources"
  ON public.scraping_sources
  FOR ALL
  TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM public.admins))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM public.admins));

-- ---------------------------------------------------------
-- 8. Indici FK per performance RLS sub-query
-- ---------------------------------------------------------
-- Le policy fanno JOIN bookings -> events -> venues -> auth.uid().
-- Senza indici FK ogni SELECT scala male.

CREATE INDEX IF NOT EXISTS bookings_event_id_idx ON public.bookings(event_id);
CREATE INDEX IF NOT EXISTS bookings_user_id_idx ON public.bookings(user_id);
CREATE INDEX IF NOT EXISTS events_venue_id_idx ON public.events(venue_id);
CREATE INDEX IF NOT EXISTS venues_owner_id_idx ON public.venues(owner_id);
