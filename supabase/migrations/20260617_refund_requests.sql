-- ============================================================================
-- Let's Night — 2026-06-17 — Richieste di rimborso "no-show" (approvazione ADMIN)
-- ============================================================================
-- Modello: l'utente che NON è entrato (no scan, checked_in=false) può RICHIEDERE
-- il rimborso solo DOPO la fine della serata. La richiesta NON muove denaro: la
-- approva un ADMIN dal pannello (mai il locale → niente conflitto d'interessi).
-- All'approvazione: rimborso PARZIALE (prezzo − fee, l'utente "mangia" la fee),
-- status→'cancelled', qr_code→NULL.
--
-- Niente nuove policy RLS: la richiesta e l'approvazione passano SEMPRE da
-- endpoint server (service role) che validano l'eleggibilità — la RLS utente
-- (immutabilità bookings, migration 20260614) resta intatta e severa.
-- Idempotente, non tocca dati esistenti.
-- ============================================================================

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS refund_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_request_reason text;

-- Coda admin: solo le prenotazioni con richiesta pendente.
CREATE INDEX IF NOT EXISTS idx_bookings_refund_pending
  ON public.bookings (refund_requested_at)
  WHERE refund_requested_at IS NOT NULL;
