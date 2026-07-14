-- ============================================================================
-- Let's Night — 2026-07-14 — TIPOLOGIE DI INGRESSO (event_ticket_types)
-- ============================================================================
-- Piano Base business: un evento può offrire più tipologie di ingresso
-- (es. "Base 15€ · 1 drink", "Premium 25€ · 2 drink", "Lista 10€"), ognuna con
-- nome, descrizione, prezzo, drink inclusi, quantità (NULL = illimitata),
-- ordine e stato attivo. Pattern identico a event_table_types (tavoli).
--
-- REGOLA PRODOTTO: se un evento ha ≥1 tipologia ATTIVA, quelle sono le uniche
-- opzioni d'acquisto; events.price viene AUTO-SINCRONIZZATO al prezzo minimo
-- attivo (così card, filtri gratis/pagato e "da X€" restano corretti ovunque
-- senza toccare le superfici di display). Zero tipologie → tutto come oggi.
--
-- SICUREZZA (stessa filosofia del fix C1):
--  • un client autenticato può auto-inserire SOLO prenotazioni gratuite, e se
--    indica una tipologia dev'essere dell'evento, attiva e a prezzo 0;
--  • la disponibilità per-tipologia è verità atomica di un trigger (il
--    fulfillment cattura TICKET_TYPE_FULL e rimborsa, pattern oversold);
--  • ticket_type_id è immutabile post-insert;
--  • FK bookings→tipologia SENZA clausola ON DELETE (NO ACTION, valutata a
--    fine statement): la tipologia con prenotazioni non si elimina (si
--    disattiva), ma l'eliminazione dell'EVENTO — che cascade-elimina prima le
--    bookings via event_id — resta possibile (precedente: bookings_table_id).
-- Idempotente. Da applicare A MANO nel SQL editor.
-- ============================================================================

-- ── 1. Tabella ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_ticket_types (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  price           numeric NOT NULL CHECK (price >= 0),
  drinks_included integer NOT NULL DEFAULT 0 CHECK (drinks_included >= 0),
  quantity        integer CHECK (quantity IS NULL OR quantity > 0),  -- NULL = illimitata
  sort_order      integer NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_ticket_types_event_idx ON public.event_ticket_types (event_id);

-- ── 2. RLS (fotocopia di event_table_types) ─────────────────────────────────
ALTER TABLE public.event_ticket_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ticket types readable by all" ON public.event_ticket_types;
CREATE POLICY "Ticket types readable by all" ON public.event_ticket_types
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Venue owners manage ticket types" ON public.event_ticket_types;
CREATE POLICY "Venue owners manage ticket types" ON public.event_ticket_types
  FOR ALL TO authenticated
  USING (event_id IN (SELECT e.id FROM public.events e JOIN public.venues v ON v.id = e.venue_id WHERE v.owner_id = auth.uid()))
  WITH CHECK (event_id IN (SELECT e.id FROM public.events e JOIN public.venues v ON v.id = e.venue_id WHERE v.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Admins manage ticket types" ON public.event_ticket_types;
CREATE POLICY "Admins manage ticket types" ON public.event_ticket_types
  FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM public.admins))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM public.admins));

-- ── 3. bookings.ticket_type_id ──────────────────────────────────────────────
-- NO ACTION (nessuna clausola): vedi intestazione.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS ticket_type_id uuid REFERENCES public.event_ticket_types(id);

CREATE INDEX IF NOT EXISTS bookings_ticket_type_idx ON public.bookings (ticket_type_id) WHERE ticket_type_id IS NOT NULL;

-- ── 4. Guardia C1 estesa (client authenticated: solo gratuito, tipo valido) ─
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
  tt             record;
BEGIN
  -- Ruolo del chiamante dal token; nel SQL editor resta '' → passa.
  jwt_role := COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );

  -- Solo gli utenti finali loggati sono la superficie d'attacco: il server
  -- fidato (service_role) passa SEMPRE — mai bloccare i pagamenti.
  IF jwt_role IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('cancelled', 'denied') THEN
    RETURN NEW;
  END IF;

  IF NEW.stripe_session_id IS NOT NULL
     OR NEW.table_id IS NOT NULL
     OR COALESCE(NEW.booking_type, 'ticket') = 'table_share'
     OR COALESCE(NEW.total_price, 0) <> 0
     OR COALESCE(NEW.fee, 0) <> 0 THEN
    RAISE EXCEPTION 'BOOKING_PAID_MUST_USE_CHECKOUT: le prenotazioni a pagamento passano dal checkout';
  END IF;

  -- Il tetto 10 ingressi era solo client-side: ora vale anche sugli insert diretti.
  IF COALESCE(NEW.quantity, 1) > 10 THEN
    RAISE EXCEPTION 'BOOKING_QUANTITY_TOO_HIGH: massimo 10 ingressi per prenotazione';
  END IF;

  IF NEW.ticket_type_id IS NOT NULL THEN
    -- Tipologia indicata: dev'essere dell'evento, attiva e DAVVERO gratuita.
    SELECT * INTO tt FROM public.event_ticket_types WHERE id = NEW.ticket_type_id;
    IF tt IS NULL OR tt.event_id IS DISTINCT FROM NEW.event_id THEN
      RAISE EXCEPTION 'BOOKING_TICKET_TYPE_INVALID: tipologia inesistente o di un altro evento';
    END IF;
    IF NOT tt.is_active THEN
      RAISE EXCEPTION 'BOOKING_TICKET_TYPE_INACTIVE: tipologia non più disponibile';
    END IF;
    effective := GREATEST(0, COALESCE(tt.price, 0));
  ELSE
    -- Nessuna tipologia (client legacy / evento senza tipologie): fallback
    -- events.price come prima. Con tipologie attive, price = minimo attivo
    -- (sincronizzato): un minimo > 0 blocca comunque l'insert gratuito.
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
  END IF;

  IF effective > 0 THEN
    RAISE EXCEPTION 'BOOKING_PAID_EVENT_REQUIRES_PAYMENT: evento a pagamento, serve il checkout';
  END IF;

  RETURN NEW;
END;
$$;

-- ── 5. Disponibilità per-tipologia (verità atomica, vale per TUTTI i caller) ─
CREATE OR REPLACE FUNCTION public.enforce_ticket_type_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t     record;
  taken int;
BEGIN
  IF NEW.ticket_type_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status IN ('cancelled', 'denied') THEN RETURN NEW; END IF;

  SELECT * INTO t FROM public.event_ticket_types
  WHERE id = NEW.ticket_type_id FOR UPDATE;
  IF t IS NULL THEN
    RAISE EXCEPTION 'TICKET_TYPE_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  -- Coerenza per ogni chiamante (anche service_role, che il guard C1 esenta):
  -- la tipologia deve appartenere all'evento e valere solo per i biglietti.
  IF t.event_id IS DISTINCT FROM NEW.event_id
     OR COALESCE(NEW.booking_type, 'ticket') <> 'ticket' THEN
    RAISE EXCEPTION 'TICKET_TYPE_MISMATCH' USING ERRCODE = 'check_violation';
  END IF;

  IF t.quantity IS NOT NULL THEN
    SELECT COALESCE(SUM(quantity), 0) INTO taken
    FROM public.bookings
    WHERE ticket_type_id = NEW.ticket_type_id
      AND status NOT IN ('cancelled', 'denied');
    IF taken + COALESCE(NEW.quantity, 1) > t.quantity THEN
      RAISE EXCEPTION 'TICKET_TYPE_FULL' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_ticket_type_capacity ON public.bookings;
CREATE TRIGGER trg_enforce_ticket_type_capacity
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_ticket_type_capacity();

-- ── 6. Sync prezzo minimo su events.price ───────────────────────────────────
-- (a) quando le tipologie cambiano → riallinea events.price al minimo attivo
CREATE OR REPLACE FUNCTION public.sync_event_min_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m numeric;
BEGIN
  SELECT MIN(price) INTO m FROM public.event_ticket_types
  WHERE event_id = COALESCE(NEW.event_id, OLD.event_id) AND is_active;
  IF m IS NOT NULL THEN
    UPDATE public.events SET price = m
    WHERE id = COALESCE(NEW.event_id, OLD.event_id) AND price IS DISTINCT FROM m;
  END IF;
  -- UPDATE che sposta la tipologia su un altro evento (non succede via UI):
  -- riallinea anche l'evento di provenienza.
  IF TG_OP = 'UPDATE' AND OLD.event_id IS DISTINCT FROM NEW.event_id THEN
    SELECT MIN(price) INTO m FROM public.event_ticket_types
    WHERE event_id = OLD.event_id AND is_active;
    IF m IS NOT NULL THEN
      UPDATE public.events SET price = m
      WHERE id = OLD.event_id AND price IS DISTINCT FROM m;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_event_min_price ON public.event_ticket_types;
CREATE TRIGGER trg_sync_event_min_price
  AFTER INSERT OR UPDATE OR DELETE ON public.event_ticket_types
  FOR EACH ROW EXECUTE FUNCTION public.sync_event_min_price();

-- (b) scritture manuali di events.price (form web business, EventFormModal):
-- con tipologie attive il prezzo è governato dal minimo, non dal campo libero.
CREATE OR REPLACE FUNCTION public.enforce_event_min_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m numeric;
BEGIN
  SELECT MIN(price) INTO m FROM public.event_ticket_types
  WHERE event_id = NEW.id AND is_active;
  IF m IS NOT NULL THEN
    NEW.price := m;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_event_min_price ON public.events;
CREATE TRIGGER trg_enforce_event_min_price
  BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_min_price();

-- ── 7. Immutabilità: ticket_type_id non cambia dopo la creazione ────────────
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
     OR NEW.ticket_type_id IS DISTINCT FROM OLD.ticket_type_id
     OR NEW.stripe_session_id IS DISTINCT FROM OLD.stripe_session_id THEN
    RAISE EXCEPTION 'BOOKING_IMMUTABLE_FIELD' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.qr_code IS DISTINCT FROM OLD.qr_code AND NEW.qr_code IS NOT NULL THEN
    RAISE EXCEPTION 'BOOKING_QR_IMMUTABLE' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ── 8. Registro (M3): tipologia nei log prenotazione + audit prezzi tipologie ─
CREATE OR REPLACE FUNCTION public.audit_booking_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_type  text;
BEGIN
  v_actor := auth.uid();

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (type, severity, actor_id, user_id, booking_id, event_id, message, details)
    VALUES (
      'booking_created', 'info', v_actor, NEW.user_id, NEW.id, NEW.event_id,
      'Prenotazione creata (' || COALESCE(NEW.booking_type, 'ticket') || ', ' || COALESCE(NEW.status, '?') || ')',
      jsonb_build_object(
        'status', NEW.status,
        'booking_type', NEW.booking_type,
        'quantity', NEW.quantity,
        'total_price', NEW.total_price,
        'fee', NEW.fee,
        'table_id', NEW.table_id,
        'ticket_type_id', NEW.ticket_type_id,
        'ticket_type', (SELECT name FROM public.event_ticket_types WHERE id = NEW.ticket_type_id),
        'stripe_session_id', NEW.stripe_session_id,
        'paid', NEW.stripe_session_id IS NOT NULL
      )
    );

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      v_type := CASE NEW.status
        WHEN 'cancelled' THEN 'booking_cancelled'
        WHEN 'denied'    THEN 'booking_denied'
        ELSE 'booking_status_change'
      END;
      INSERT INTO public.audit_logs (type, severity, actor_id, user_id, booking_id, event_id, message, details)
      VALUES (
        v_type,
        CASE WHEN NEW.status = 'denied' THEN 'warn' ELSE 'info' END,
        v_actor, NEW.user_id, NEW.id, NEW.event_id,
        'Stato prenotazione: ' || COALESCE(OLD.status, '?') || ' → ' || COALESCE(NEW.status, '?'),
        jsonb_build_object(
          'from', OLD.status,
          'to', NEW.status,
          'qr_invalidated', (OLD.qr_code IS NOT NULL AND NEW.qr_code IS NULL),
          'refund_reason', NEW.refund_reason,
          'total_price', NEW.total_price
        )
      );
    ELSIF OLD.qr_code IS NOT NULL AND NEW.qr_code IS NULL THEN
      INSERT INTO public.audit_logs (type, severity, actor_id, user_id, booking_id, event_id, message, details)
      VALUES (
        'qr_invalidated', 'warn', v_actor, NEW.user_id, NEW.id, NEW.event_id,
        'QR invalidato (stato invariato: ' || COALESCE(NEW.status, '?') || ')',
        jsonb_build_object('status', NEW.status)
      );
    END IF;

    IF COALESCE(NEW.checked_in, false) IS DISTINCT FROM COALESCE(OLD.checked_in, false) THEN
      INSERT INTO public.audit_logs (type, severity, actor_id, user_id, booking_id, event_id, message, details)
      VALUES (
        CASE WHEN COALESCE(NEW.checked_in, false) THEN 'checkin_set' ELSE 'checkin_removed' END,
        'info', v_actor, NEW.user_id, NEW.id, NEW.event_id,
        CASE WHEN COALESCE(NEW.checked_in, false) THEN 'Ingresso registrato' ELSE 'Ingresso rimosso' END,
        jsonb_build_object('checked_in_at', NEW.checked_in_at, 'status', NEW.status)
      );
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (type, severity, actor_id, user_id, booking_id, event_id, message, details)
    VALUES (
      'booking_deleted', 'info', v_actor, OLD.user_id, OLD.id, OLD.event_id,
      'Prenotazione eliminata (' || COALESCE(OLD.status, '?') || ')',
      jsonb_build_object(
        'status', OLD.status,
        'booking_type', OLD.booking_type,
        'quantity', OLD.quantity,
        'total_price', OLD.total_price,
        'fee', OLD.fee,
        'checked_in', OLD.checked_in,
        'ticket_type_id', OLD.ticket_type_id,
        'stripe_session_id', OLD.stripe_session_id
      )
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Cambi prezzo delle tipologie nel Registro (pattern audit_event_price_change)
CREATE OR REPLACE FUNCTION public.audit_ticket_type_price_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.price IS DISTINCT FROM OLD.price THEN
    INSERT INTO public.audit_logs (type, severity, actor_id, event_id, message, details)
    VALUES (
      'ticket_type_price_changed', 'info', auth.uid(), NEW.event_id,
      'Prezzo tipologia ingresso modificato: "' || COALESCE(NEW.name, '?') || '"',
      jsonb_build_object(
        'ticket_type_id', NEW.id, 'name', NEW.name,
        'price_from', OLD.price, 'price_to', NEW.price
      )
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_ticket_type_price_change ON public.event_ticket_types;
CREATE TRIGGER trg_audit_ticket_type_price_change
  AFTER UPDATE ON public.event_ticket_types
  FOR EACH ROW EXECUTE FUNCTION public.audit_ticket_type_price_change();

-- ── 9. Igiene ────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.guard_booking_insert_payment()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_ticket_type_capacity()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_event_min_price()           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_event_min_price()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_booking_immutability()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_booking_changes()          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_ticket_type_price_change() FROM PUBLIC, anon, authenticated;
