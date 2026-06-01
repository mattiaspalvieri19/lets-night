-- =========================================================
-- Aggiunge gender su profiles + booking_type su bookings
-- per supportare la lista nominativa lato business.
-- =========================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender text
  CHECK (gender IS NULL OR gender IN ('M', 'F', 'X'));

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS booking_type text DEFAULT 'ticket'
  CHECK (booking_type IN ('ticket', 'table'));

-- Estendi anche la SELECT del venue owner per includere gender
-- (gia esistente, ma replico per sicurezza il filtro su cancelled)
-- La policy attuale "Venue owners can view bookers profiles" gia
-- copre tutti i campi di profiles, quindi nessuna RLS da toccare.

-- Aggiungi inoltre alla tabella events una flag opzionale
-- has_tables (mostrato nella schermata business detail)
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS has_tables boolean DEFAULT false;
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS table_price numeric;
