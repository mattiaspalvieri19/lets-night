-- Abilita RLS su bookings se non già attiva
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Utente legge solo le proprie prenotazioni
CREATE POLICY "bookings_select_own"
ON public.bookings FOR SELECT
USING (auth.uid() = user_id);

-- Utente inserisce solo prenotazioni per sé
CREATE POLICY "bookings_insert_own"
ON public.bookings FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Utente aggiorna solo le proprie (es. cancellazione)
CREATE POLICY "bookings_update_own"
ON public.bookings FOR UPDATE
USING (auth.uid() = user_id);

-- Business owner vede le prenotazioni dei propri eventi
CREATE POLICY "bookings_select_venue_owner"
ON public.bookings FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    JOIN public.venues v ON v.id = e.venue_id
    WHERE e.id = bookings.event_id
      AND v.owner_id = auth.uid()
  )
);

-- Admin vede tutto
CREATE POLICY "bookings_select_admin"
ON public.bookings FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);
