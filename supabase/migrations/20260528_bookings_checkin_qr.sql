-- Bookings: check-in e QR code
-- Run this in Supabase Dashboard > SQL Editor

-- 1. Aggiungi colonne check-in al bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS checked_in BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;

-- 2. Il qr_code sarà un UUID univoco generato lato app al momento della prenotazione
-- La colonna esiste già (TEXT), nessuna modifica necessaria

-- 3. RLS: il venue owner può leggere le prenotazioni dei suoi eventi (per scanner e dashboard)
CREATE POLICY "Venue owners can view bookings for their events"
  ON public.bookings FOR SELECT TO authenticated
  USING (
    event_id IN (
      SELECT id FROM public.events
      WHERE venue_id IN (
        SELECT id FROM public.venues WHERE owner_id = auth.uid()
      )
    )
  );

-- 4. RLS: il venue owner può aggiornare il check-in delle prenotazioni dei suoi eventi
CREATE POLICY "Venue owners can check in bookings"
  ON public.bookings FOR UPDATE TO authenticated
  USING (
    event_id IN (
      SELECT id FROM public.events
      WHERE venue_id IN (
        SELECT id FROM public.venues WHERE owner_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    event_id IN (
      SELECT id FROM public.events
      WHERE venue_id IN (
        SELECT id FROM public.venues WHERE owner_id = auth.uid()
      )
    )
  );

-- 5. RLS: admin può vedere e aggiornare tutte le prenotazioni
CREATE POLICY "Admins can view all bookings"
  ON public.bookings FOR SELECT TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM public.admins));

CREATE POLICY "Admins can update all bookings"
  ON public.bookings FOR UPDATE TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM public.admins))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM public.admins));
