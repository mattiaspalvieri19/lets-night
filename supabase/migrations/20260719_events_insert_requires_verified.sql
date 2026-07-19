-- ============================================================================
-- Let's Night — 2026-07-19 — CREAZIONE EVENTI SUBORDINATA ALL'APPROVAZIONE
-- ============================================================================
-- Chiusura sliver M1. La SELECT policy pubblica già nasconde a tutti gli
-- eventi dei locali non verificati, e la UI blocca la creazione — ma la
-- policy INSERT no: via API diretta un locale non approvato poteva
-- pre-caricare eventi (invisibili), che diventavano pubblici nell'istante
-- dell'approvazione del locale. Decisione Mattia 2026-07-19: anche la
-- CREAZIONE richiede is_verified = true. Gli admin restano liberi (creano
-- eventi per qualsiasi locale dall'area admin, policy separata invariata).
-- Idempotente. Da applicare A MANO nel SQL editor.
-- ============================================================================

DROP POLICY IF EXISTS "Venue owners can insert events" ON public.events;
CREATE POLICY "Venue owners can insert events" ON public.events FOR INSERT TO public
  WITH CHECK (venue_id IN (
    SELECT venues.id FROM public.venues
    WHERE venues.owner_id = auth.uid() AND venues.is_verified = true
  ));
