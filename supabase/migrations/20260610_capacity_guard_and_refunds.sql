-- ============================================================================
-- Let's Night — 2026-06-10
-- 1) Capacity guard atomico (paid + free, a prova di race)
-- 2) Colonne per tracciare rimborsi / negazione ingresso
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) CAPACITY GUARD
-- Blocca qualsiasi prenotazione che sforerebbe la capienza dell'evento.
-- Protegge sia il flusso a pagamento (insert da fulfillBooking) sia quello
-- gratuito (insert diretto dal client) che prima non aveva NESSUN controllo.
--
-- Atomicità: SELECT ... FOR UPDATE blocca la riga dell'evento, serializzando
-- le prenotazioni concorrenti dello stesso evento → niente oversell da race.
-- SECURITY DEFINER: il conteggio deve vedere TUTTE le prenotazioni, non solo
-- quelle dell'utente (altrimenti la RLS "Users can view own bookings" falserebbe
-- la somma).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_event_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cap   int;
  taken int;
BEGIN
  -- Le prenotazioni già annullate/negate non occupano posto.
  IF NEW.status IN ('cancelled', 'denied') THEN
    RETURN NEW;
  END IF;

  -- Lock della riga evento: serializza le insert concorrenti sullo stesso evento.
  SELECT capacity INTO cap FROM public.events WHERE id = NEW.event_id FOR UPDATE;

  -- Capienza non impostata = illimitata.
  IF cap IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO taken
  FROM public.bookings
  WHERE event_id = NEW.event_id
    AND status NOT IN ('cancelled', 'denied');

  IF taken + NEW.quantity > cap THEN
    RAISE EXCEPTION 'CAPACITY_FULL' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_event_capacity ON public.bookings;
CREATE TRIGGER trg_enforce_event_capacity
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_capacity();

-- ----------------------------------------------------------------------------
-- 2) ALLINEA booked_count: una prenotazione 'denied' (ingresso negato + rimborso)
-- libera il posto, esattamente come 'cancelled'. Il trigger originale escludeva
-- solo 'cancelled', quindi le denied restavano conteggiate → booked_count gonfio
-- e falsi "sold out" sul check applicativo del flusso a pagamento.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_event_booked_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
  DECLARE affected_event uuid;
  BEGIN
    IF TG_OP = 'DELETE' THEN affected_event := OLD.event_id;
    ELSE affected_event := NEW.event_id; END IF;
    UPDATE public.events SET booked_count = (
      SELECT COALESCE(SUM(quantity), 0) FROM public.bookings
      WHERE event_id = affected_event AND status NOT IN ('cancelled', 'denied')
    ) WHERE id = affected_event;
    RETURN COALESCE(NEW, OLD);
  END;
$$;

-- ----------------------------------------------------------------------------
-- 3) REFUND / DENIED ENTRY tracking
-- Lo stato "ingresso negato" si registra in bookings.status = 'denied'
-- (colonna text esistente, nessun enum). Queste colonne sono il dettaglio:
-- ----------------------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS refund_reason text,
  ADD COLUMN IF NOT EXISTS refunded_at  timestamptz;
