-- Idempotency key per Stripe Checkout: una session_id genera al massimo una booking row.
-- Risolve replay attack (cancellare e ri-confermare con stessa session) e race condition (2 webhook concorrenti).
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS stripe_session_id text;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_stripe_session_id_uniq
  ON public.bookings(stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

-- Snapshot del nome al momento della prenotazione: impedisce attacchi di rename post-checkin
-- (utente modifica full_name dopo aver condiviso screenshot QR, altra persona si presenta col nome cambiato).
-- Lo scanner del bouncer mostra questo snapshot, non il full_name corrente.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS snapshot_full_name text;
