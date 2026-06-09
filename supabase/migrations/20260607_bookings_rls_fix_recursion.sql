-- Le 5 policy aggiunte da 20260606_bookings_rls.sql duplicavano quelle esistenti
-- (Users can view/create/cancel own bookings, Venue owners can view bookings for their events, Admins can view all bookings)
-- e causavano ricorsione infinita: bookings_select_admin → profiles → "Venue owners can view bookers profiles" → bookings → ...
-- Le policy originali coprono già tutti i casi senza recursion.

DROP POLICY IF EXISTS "bookings_select_own" ON public.bookings;
DROP POLICY IF EXISTS "bookings_insert_own" ON public.bookings;
DROP POLICY IF EXISTS "bookings_update_own" ON public.bookings;
DROP POLICY IF EXISTS "bookings_select_venue_owner" ON public.bookings;
DROP POLICY IF EXISTS "bookings_select_admin" ON public.bookings;
