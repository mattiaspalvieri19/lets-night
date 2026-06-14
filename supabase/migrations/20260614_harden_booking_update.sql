-- ============================================================================
-- Let's Night — 2026-06-14 — HARDENING UPDATE su bookings (da ultrareview)
-- ============================================================================
-- #1 (GRAVE) "Users can cancel own bookings" aveva USING ma NESSUN WITH CHECK
--    → l'espressione USING veniva ereditata come WITH CHECK, proteggendo solo
--    user_id. Un utente poteva quindi modificare la PROPRIA prenotazione a
--    piacere via API REST (stesso endpoint dell'app, con il suo token): es.
--    ripuntare event_id a un evento più costoso/sold-out tenendo status
--    'confirmed' → QR valido lì → ingresso gratis. Ora ogni UPDATE fatto
--    dall'utente DEVE risultare in status='cancelled' (può solo annullare).
--
-- #2 + difesa in profondità: trigger di immutabilità. I campi finanziari e di
--    identità NON cambiano dopo la creazione per NESSUNO (vale anche per il
--    locale sui propri eventi e perfino bypassando la RLS). qr_code può solo
--    essere AZZERATO (invalidazione su rimborso), mai riscritto con un nuovo
--    valore. I flussi legittimi (annulla, check-in, deny+refund) toccano solo
--    status/checked_in/checked_in_at/qr_code→null → restano permessi.
--
-- Idempotente: DROP POLICY/TRIGGER IF EXISTS + CREATE OR REPLACE. Non modifica
-- dati esistenti.
-- ============================================================================

-- #1 — l'utente può solo ANNULLARE la propria prenotazione
DROP POLICY IF EXISTS "Users can cancel own bookings" ON public.bookings;
CREATE POLICY "Users can cancel own bookings" ON public.bookings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND status = 'cancelled');

-- #2 — immutabilità dei campi sensibili su UPDATE (qualunque sia il chiamante)
CREATE OR REPLACE FUNCTION public.enforce_booking_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.event_id          IS DISTINCT FROM OLD.event_id
     OR NEW.user_id        IS DISTINCT FROM OLD.user_id
     OR NEW.quantity       IS DISTINCT FROM OLD.quantity
     OR NEW.total_price    IS DISTINCT FROM OLD.total_price
     OR NEW.fee            IS DISTINCT FROM OLD.fee
     OR NEW.booking_type   IS DISTINCT FROM OLD.booking_type
     OR NEW.table_id       IS DISTINCT FROM OLD.table_id
     OR NEW.stripe_session_id IS DISTINCT FROM OLD.stripe_session_id THEN
    RAISE EXCEPTION 'BOOKING_IMMUTABLE_FIELD' USING ERRCODE = 'check_violation';
  END IF;
  -- qr_code: solo azzeramento (rimborso invalida il biglietto), mai un nuovo valore
  IF NEW.qr_code IS DISTINCT FROM OLD.qr_code AND NEW.qr_code IS NOT NULL THEN
    RAISE EXCEPTION 'BOOKING_QR_IMMUTABLE' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_booking_immutability ON public.bookings;
CREATE TRIGGER trg_enforce_booking_immutability
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_immutability();

REVOKE EXECUTE ON FUNCTION public.enforce_booking_immutability() FROM PUBLIC, anon, authenticated;
