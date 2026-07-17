-- ============================================================================
-- Let's Night — 2026-07-17 — SPOSTAMENTO PARTECIPANTE TRA TAVOLI (solo ADMIN)
-- ============================================================================
-- L'admin può spostare un partecipante da un tavolo a un altro dello STESSO
-- evento (gestione operativa: riorganizzare tavoli pubblici, "unire" tavoli
-- spostando i membri). Il campo bookings.table_id è protetto dal trigger di
-- immutabilità (anti-frode 20260614): lo spostamento passa SOLO da una RPC
-- SECURITY DEFINER con check admin interno, che sblocca l'immutabilità per la
-- durata della PROPRIA transazione via set_config transaction-local. Nessun
-- client (business incluso) può replicarlo: la chiamata diretta UPDATE resta
-- bloccata dal trigger, la RPC rifiuta i non-admin con ADMIN_ONLY.
--
-- GARANZIE:
--  • stesso evento, tavolo destinazione non pieno e non annullato;
--  • il pagamento NON viene toccato (total_price/fee/stripe_session_id
--    restano immutabili) e il QR resta valido: contiene solo un codice
--    casuale, lo scanner risolve il tavolo dalla prenotazione;
--  • i totali di ENTRAMBI i tavoli vengono risincronizzati (fix del trigger
--    sync_table_aggregates, che su UPDATE copriva un solo tavolo);
--  • se il tavolo di origine resta senza membri attivi viene annullato
--    (niente tavoli pubblici fantasma);
--  • ogni spostamento finisce nel Registro (audit_logs: table_member_moved).
-- Idempotente. Da applicare A MANO nel SQL editor.
-- ============================================================================

-- ── 1. sync_table_aggregates: su cambio tavolo risincronizza ENTRAMBI ───────
CREATE OR REPLACE FUNCTION public.sync_table_aggregates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
  DECLARE
    tids uuid[];
    tid  uuid;
    seats int;
    paid numeric;
  BEGIN
    tids := ARRAY(SELECT DISTINCT x FROM unnest(ARRAY[NEW.table_id, OLD.table_id]) AS x WHERE x IS NOT NULL);
    IF tids IS NULL OR array_length(tids, 1) IS NULL THEN
      RETURN COALESCE(NEW, OLD);
    END IF;

    FOREACH tid IN ARRAY tids LOOP
      SELECT count(*), COALESCE(SUM(total_price), 0) INTO seats, paid
      FROM public.bookings
      WHERE table_id = tid AND status NOT IN ('cancelled','denied');

      UPDATE public.event_tables
      SET people_count = seats,
          collected = paid,
          status = CASE
            WHEN status = 'cancelled' THEN status
            WHEN paid >= total_price THEN 'covered'
            ELSE 'open'
          END
      WHERE id = tid;
    END LOOP;

    RETURN COALESCE(NEW, OLD);
  END;
$$;

-- ── 2. Immutabilità: table_id modificabile SOLO dentro la RPC di spostamento ─
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
     OR NEW.ticket_type_id IS DISTINCT FROM OLD.ticket_type_id
     OR NEW.stripe_session_id IS DISTINCT FROM OLD.stripe_session_id THEN
    RAISE EXCEPTION 'BOOKING_IMMUTABLE_FIELD' USING ERRCODE = 'check_violation';
  END IF;
  -- table_id: immutabile per TUTTI, tranne dentro admin_move_table_member
  -- (flag transaction-local settato solo dalla RPC, mai esposto ai client).
  IF NEW.table_id IS DISTINCT FROM OLD.table_id
     AND COALESCE(current_setting('letsnight.table_move', true), '') <> '1' THEN
    RAISE EXCEPTION 'BOOKING_IMMUTABLE_FIELD' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.qr_code IS DISTINCT FROM OLD.qr_code AND NEW.qr_code IS NOT NULL THEN
    RAISE EXCEPTION 'BOOKING_QR_IMMUTABLE' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ── 3. RPC: sposta un partecipante su un altro tavolo dello stesso evento ───
CREATE OR REPLACE FUNCTION public.admin_move_table_member(p_booking_id uuid, p_dest_table_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b            record;
  origin       record;
  dest         record;
  dest_members int;
  origin_left  int;
  origin_emptied boolean := false;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() NOT IN (SELECT user_id FROM public.admins) THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF b IS NULL THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF b.table_id IS NULL THEN
    RAISE EXCEPTION 'NOT_A_TABLE_MEMBER' USING ERRCODE = 'check_violation';
  END IF;
  IF b.status IN ('cancelled', 'denied') THEN
    RAISE EXCEPTION 'MEMBER_NOT_ACTIVE' USING ERRCODE = 'check_violation';
  END IF;
  IF b.table_id = p_dest_table_id THEN
    RAISE EXCEPTION 'SAME_TABLE' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO origin FROM public.event_tables WHERE id = b.table_id FOR UPDATE;
  SELECT * INTO dest   FROM public.event_tables WHERE id = p_dest_table_id FOR UPDATE;
  IF dest IS NULL THEN
    RAISE EXCEPTION 'DEST_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF dest.status = 'cancelled' THEN
    RAISE EXCEPTION 'DEST_CANCELLED' USING ERRCODE = 'check_violation';
  END IF;
  -- Mai tra eventi (né locali) diversi.
  IF dest.event_id IS DISTINCT FROM b.event_id THEN
    RAISE EXCEPTION 'DIFFERENT_EVENT' USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO dest_members
  FROM public.bookings
  WHERE table_id = p_dest_table_id AND status NOT IN ('cancelled','denied');
  IF dest_members + 1 > dest.max_people THEN
    RAISE EXCEPTION 'DEST_FULL' USING ERRCODE = 'check_violation';
  END IF;

  -- Sblocco immutabilità SOLO per questa transazione, poi UPDATE.
  PERFORM set_config('letsnight.table_move', '1', true);
  UPDATE public.bookings SET table_id = p_dest_table_id WHERE id = p_booking_id;
  -- (sync_table_aggregates risincronizza origine e destinazione)

  -- Origine rimasta vuota → annullata: non deve restare un tavolo fantasma.
  SELECT count(*) INTO origin_left
  FROM public.bookings
  WHERE table_id = b.table_id AND status NOT IN ('cancelled','denied');
  IF origin_left = 0 THEN
    UPDATE public.event_tables SET status = 'cancelled' WHERE id = b.table_id;
    origin_emptied := true;
  END IF;

  -- Registro (M3): lo spostamento è un'azione operativa admin da tracciare.
  BEGIN
    INSERT INTO public.audit_logs (type, severity, actor_id, user_id, booking_id, event_id, message, details)
    VALUES (
      'table_member_moved', 'info', auth.uid(), b.user_id, b.id, b.event_id,
      'Partecipante spostato di tavolo dall''amministrazione',
      jsonb_build_object(
        'from_table', b.table_id,
        'to_table', p_dest_table_id,
        'amount_paid', b.total_price,
        'origin_emptied', origin_emptied
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;  -- il diario non blocca mai l'operazione
  END;

  RETURN jsonb_build_object('ok', true, 'origin_emptied', origin_emptied);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_move_table_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_move_table_member(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.sync_table_aggregates()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_booking_immutability() FROM PUBLIC, anon, authenticated;
