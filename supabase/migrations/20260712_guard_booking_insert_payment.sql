-- ============================================================================
-- Let's Night — 2026-07-12 — GUARDIA PAGAMENTO su INSERT bookings (fix C1)
-- ============================================================================
-- FALLA CHIUSA: la policy `bookings_insert_own` controlla solo user_id, e le
-- guardie esistenti coprono capienza (BEFORE INSERT) e immutabilità (BEFORE
-- UPDATE, migration 20260614). NESSUNA guardia impediva a un utente loggato di
-- fabbricare via API REST (anon key + proprio token) una prenotazione ATTIVA a
-- prezzo 0 per un evento A PAGAMENTO, con un qr_code a scelta → biglietto gratis
-- valido allo scanner. È l'analogo su INSERT del buco UPDATE già chiuso.
--
-- REGOLA: solo il server fidato (service_role, cioè il fulfillment Stripe che ha
-- già verificato il pagamento) può creare prenotazioni a pagamento/tavolo/con
-- stripe_session_id. Un utente finale loggato può creare SOLO una prenotazione
-- GRATUITA, e SOLO se l'evento è davvero gratuito.
--
-- SICUREZZA DEL FALLIMENTO: la restrizione scatta SOLO quando il chiamante è un
-- utente finale (auth.role() = 'authenticated'). Per il service_role (e ogni
-- altro contesto) il trigger lascia passare → i pagamenti reali non rischiano
-- MAI di essere bloccati per un falso positivo.
--
-- Flussi legittimi che restano intatti (verificati nel codice):
--   • Prenotazione gratuita client (mobile BookingModal.jsx, web event/[id]):
--     total_price 0, fee 0, no stripe_session_id, no table_id, evento price 0.
--   • Prenotazione a pagamento / tavolo condiviso: SOLO server (fulfillBooking.js,
--     service_role, con stripe_session_id) → esente.
-- Idempotente. Da applicare A MANO nel SQL editor.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guard_booking_insert_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ev_price       numeric;
  ev_table_price numeric;
  effective      numeric;
  jwt_role       text;
BEGIN
  -- Ruolo del chiamante letto dal token (grezzo, senza dipendere da auth.role()):
  -- NULLIF evita il cast di stringa vuota a jsonb; nel SQL editor (nessun token)
  -- resta '' → trattato come NON-authenticated → passa.
  jwt_role := COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );

  -- Solo gli utenti finali loggati sono la superficie d'attacco. Il server fidato
  -- (service_role) e ogni altro contesto passano SEMPRE: mai bloccare i pagamenti.
  IF jwt_role IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  -- Le prenotazioni non-attive (annullate/negate) non danno ingresso: innocue.
  IF NEW.status IN ('cancelled', 'denied') THEN
    RETURN NEW;
  END IF;

  -- Un utente non può MAI auto-emettere una prenotazione a pagamento, di tavolo,
  -- o con una sessione Stripe: quei flussi passano solo dal fulfillment server.
  IF NEW.stripe_session_id IS NOT NULL
     OR NEW.table_id IS NOT NULL
     OR COALESCE(NEW.booking_type, 'ticket') = 'table_share'
     OR COALESCE(NEW.total_price, 0) <> 0
     OR COALESCE(NEW.fee, 0) <> 0 THEN
    RAISE EXCEPTION 'BOOKING_PAID_MUST_USE_CHECKOUT: le prenotazioni a pagamento passano dal checkout';
  END IF;

  -- E l'evento dev'essere DAVVERO gratuito per questo tipo (stessa logica di
  -- computeBookingPrice: ticket→price; table→table_price se presente, altrimenti price*4).
  SELECT price, table_price INTO ev_price, ev_table_price
  FROM public.events WHERE id = NEW.event_id;

  IF COALESCE(NEW.booking_type, 'ticket') = 'table' THEN
    effective := CASE
      WHEN ev_table_price IS NOT NULL THEN GREATEST(0, ev_table_price)
      ELSE GREATEST(0, COALESCE(ev_price, 0)) * 4
    END;
  ELSE
    effective := GREATEST(0, COALESCE(ev_price, 0));
  END IF;

  IF effective > 0 THEN
    RAISE EXCEPTION 'BOOKING_PAID_EVENT_REQUIRES_PAYMENT: evento a pagamento, serve il checkout';
  END IF;

  RETURN NEW;
END;
$$;

-- I trigger non richiedono EXECUTE al chiamante; revochiamo per igiene.
REVOKE EXECUTE ON FUNCTION public.guard_booking_insert_payment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_booking_insert_payment ON public.bookings;
CREATE TRIGGER trg_guard_booking_insert_payment
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_insert_payment();
