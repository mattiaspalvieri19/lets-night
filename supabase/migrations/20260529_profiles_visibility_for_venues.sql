-- Permette ai venue owner di leggere i profili dei clienti che hanno prenotato
-- presso uno dei loro eventi. Necessario per lo scanner QR (nome, telefono, eta)
-- e per la lista prenotazioni nella business dashboard.

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
    )
    OR auth.uid() IN (SELECT user_id FROM admins)
  );

-- Aggiungere ALSO admin SELECT su profiles (utile per pannello admin futuro)
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admins));
