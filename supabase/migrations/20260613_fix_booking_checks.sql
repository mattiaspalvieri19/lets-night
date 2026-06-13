-- ============================================================================
-- Let's Night — 2026-06-13 — FIX vincoli CHECK su bookings
-- Allinea i CHECK ai valori effettivamente usati dal codice:
--   booking_type: aggiunto 'table_share' (quote dei tavoli condivisi, Fase A).
--                 Senza, ogni quota tavolo violava il vincolo → 23514 →
--                 interpretato come "tavolo pieno" → refund automatico.
--   status:       aggiunto 'denied' (ingresso negato dal locale → refund,
--                 introdotto 2026-06-10). Senza, settare 'denied' falliva.
-- NB: i CHECK passano comunque su NULL, quindi righe storiche restano valide.
-- Idempotente: DROP IF EXISTS + ADD.
-- ============================================================================

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_booking_type_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_booking_type_check
  CHECK (booking_type = ANY (ARRAY['ticket'::text, 'table'::text, 'table_share'::text]));

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'cancelled'::text, 'denied'::text]));
