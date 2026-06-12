-- ============================================================================
-- Let's Night — 2026-06-12 — TAVOLI CONDIVISI v1 (Fase A)
-- Tipologie di tavolo per evento (create dal locale) + tavoli aperti dagli
-- utenti (public/private) + quote come bookings (QR/scanner/rimborsi riusati).
-- Regole: quote flessibili fino a coprire il totale; tavoli FUORI dalla
-- capienza ingressi; disponibilità per tipologia enforced atomicamente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TIPOLOGIE DI TAVOLO (es. Standard 300€ / Premium 400€ / Privé 500€)
-- ----------------------------------------------------------------------------
CREATE TABLE public.event_table_types (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name         text NOT NULL,
  total_price  numeric NOT NULL CHECK (total_price >= 0),
  max_people   int NOT NULL DEFAULT 8 CHECK (max_people BETWEEN 1 AND 30),
  includes     text,                          -- cosa comprende: "3 bottiglie champagne, 2 gin..."
  tables_count int NOT NULL DEFAULT 1 CHECK (tables_count >= 0),
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE public.event_table_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Table types readable by all"
  ON public.event_table_types FOR SELECT
  USING (true);

CREATE POLICY "Venue owners manage table types"
  ON public.event_table_types FOR ALL
  TO authenticated
  USING (event_id IN (
    SELECT e.id FROM public.events e
    JOIN public.venues v ON v.id = e.venue_id
    WHERE v.owner_id = auth.uid()
  ))
  WITH CHECK (event_id IN (
    SELECT e.id FROM public.events e
    JOIN public.venues v ON v.id = e.venue_id
    WHERE v.owner_id = auth.uid()
  ));

CREATE INDEX event_table_types_event_idx ON public.event_table_types(event_id);

-- ----------------------------------------------------------------------------
-- 2) TAVOLI APERTI DAGLI UTENTI
-- total_price/max_people sono SNAPSHOT della tipologia al momento dell'apertura
-- (il locale può cambiare i listini senza alterare i tavoli già aperti).
-- ----------------------------------------------------------------------------
CREATE TABLE public.event_tables (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  type_id     uuid NOT NULL REFERENCES public.event_table_types(id),
  created_by  uuid NOT NULL REFERENCES public.profiles(id),
  visibility  text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
  status      text NOT NULL DEFAULT 'open'  CHECK (status IN ('open','covered','cancelled')),
  total_price numeric NOT NULL,
  max_people  int NOT NULL,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.event_tables ENABLE ROW LEVEL SECURITY;

-- Visibili: i public a tutti (per unirsi), i private a creatore/membri/locale/admin.
CREATE POLICY "Tables visible by visibility"
  ON public.event_tables FOR SELECT
  USING (
    visibility = 'public'
    OR created_by = auth.uid()
    OR id IN (SELECT b.table_id FROM public.bookings b WHERE b.user_id = auth.uid() AND b.table_id IS NOT NULL)
    OR event_id IN (
      SELECT e.id FROM public.events e
      JOIN public.venues v ON v.id = e.venue_id
      WHERE v.owner_id = auth.uid()
    )
    OR auth.uid() IN (SELECT user_id FROM public.admins)
  );
-- INSERT/UPDATE solo server-side (service role bypassa RLS): l'apertura del
-- tavolo avviene nel fulfillment Stripe, mai dal client diretto.

CREATE INDEX event_tables_event_idx ON public.event_tables(event_id);
CREATE INDEX event_tables_type_idx  ON public.event_tables(type_id);

-- Dedup apertura tavolo: webhook e confirm-booking possono correre in parallelo
-- sulla stessa session Stripe — il secondo insert fallisce e recupera l'esistente.
ALTER TABLE public.event_tables ADD COLUMN stripe_session_id text UNIQUE;

-- ----------------------------------------------------------------------------
-- 3) QUOTE = BOOKINGS (riusa QR, scanner, rimborsi, biglietti)
-- ----------------------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS table_id uuid REFERENCES public.event_tables(id);

CREATE INDEX IF NOT EXISTS bookings_table_idx ON public.bookings(table_id) WHERE table_id IS NOT NULL;

-- Il vecchio UNIQUE (user_id, event_id) bloccherebbe chi ha un biglietto E vuole
-- unirsi a un tavolo dello stesso evento → vale solo per i biglietti (table_id NULL);
-- per i tavoli: max 1 quota per utente PER TAVOLO.
DROP INDEX IF EXISTS public.bookings_user_event_active_unique;
CREATE UNIQUE INDEX bookings_user_event_active_unique
  ON public.bookings (user_id, event_id)
  WHERE status <> 'cancelled' AND table_id IS NULL;
CREATE UNIQUE INDEX bookings_user_table_active_unique
  ON public.bookings (user_id, table_id)
  WHERE status NOT IN ('cancelled','denied') AND table_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4) DISPONIBILITÀ TAVOLI PER TIPOLOGIA (atomica, stesso pattern anti-oversell)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_table_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total int;
  taken int;
BEGIN
  IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;

  -- Lock della tipologia: serializza le aperture concorrenti.
  SELECT tables_count INTO total FROM public.event_table_types WHERE id = NEW.type_id FOR UPDATE;
  IF total IS NULL THEN RAISE EXCEPTION 'TABLE_TYPE_NOT_FOUND' USING ERRCODE = 'check_violation'; END IF;

  SELECT count(*) INTO taken
  FROM public.event_tables
  WHERE type_id = NEW.type_id AND status <> 'cancelled';

  IF taken + 1 > total THEN
    RAISE EXCEPTION 'TABLES_FULL' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_table_availability ON public.event_tables;
CREATE TRIGGER trg_enforce_table_availability
  BEFORE INSERT ON public.event_tables
  FOR EACH ROW EXECUTE FUNCTION public.enforce_table_availability();

REVOKE EXECUTE ON FUNCTION public.enforce_table_availability() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5) VALIDAZIONE QUOTE (posti max, quota ≤ residuo, min 10€ se a pagamento)
--    + auto-passaggio a 'covered' quando il totale è raccolto.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_table_share()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t record;
  seats int;
  paid numeric;
BEGIN
  IF NEW.table_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status IN ('cancelled','denied') THEN RETURN NEW; END IF;

  SELECT * INTO t FROM public.event_tables WHERE id = NEW.table_id FOR UPDATE;
  IF t IS NULL THEN RAISE EXCEPTION 'TABLE_NOT_FOUND' USING ERRCODE = 'check_violation'; END IF;
  IF t.status = 'cancelled' THEN RAISE EXCEPTION 'TABLE_CANCELLED' USING ERRCODE = 'check_violation'; END IF;

  SELECT count(*) INTO seats
  FROM public.bookings
  WHERE table_id = NEW.table_id AND status NOT IN ('cancelled','denied');
  IF seats + 1 > t.max_people THEN
    RAISE EXCEPTION 'TABLE_SEATS_FULL' USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(SUM(total_price), 0) INTO paid
  FROM public.bookings
  WHERE table_id = NEW.table_id AND status NOT IN ('cancelled','denied');

  IF NEW.total_price > 0 THEN
    -- Quota a pagamento: solo su tavolo ancora 'open', min 10€, non oltre il residuo.
    IF t.status <> 'open' THEN
      RAISE EXCEPTION 'TABLE_NOT_OPEN' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.total_price < 10 THEN
      RAISE EXCEPTION 'SHARE_BELOW_MIN' USING ERRCODE = 'check_violation';
    END IF;
    IF paid + NEW.total_price > t.total_price THEN
      RAISE EXCEPTION 'SHARE_EXCEEDS_REMAINING' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  -- Quota 0 (invitato su tavolo coperto dal capotavola): ammessa finché ci sono posti.

  IF paid + NEW.total_price >= t.total_price THEN
    UPDATE public.event_tables SET status = 'covered' WHERE id = NEW.table_id AND status = 'open';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_table_share ON public.bookings;
CREATE TRIGGER trg_enforce_table_share
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_table_share();

REVOKE EXECUTE ON FUNCTION public.enforce_table_share() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6) I TAVOLI NON SCALANO LA CAPIENZA INGRESSI (decisione 2026-06-12)
--    capienza e booked_count contano SOLO i biglietti.
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
  IF NEW.status IN ('cancelled', 'denied') THEN RETURN NEW; END IF;
  -- I tavoli hanno il loro inventario (trigger dedicati): qui solo ingressi.
  IF NEW.booking_type IN ('table', 'table_share') OR NEW.table_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT capacity INTO cap FROM public.events WHERE id = NEW.event_id FOR UPDATE;
  IF cap IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO taken
  FROM public.bookings
  WHERE event_id = NEW.event_id
    AND status NOT IN ('cancelled', 'denied')
    AND COALESCE(booking_type, 'ticket') NOT IN ('table', 'table_share')
    AND table_id IS NULL;

  IF taken + NEW.quantity > cap THEN
    RAISE EXCEPTION 'CAPACITY_FULL' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_event_booked_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
  DECLARE affected_event uuid;
  BEGIN
    IF TG_OP = 'DELETE' THEN affected_event := OLD.event_id;
    ELSE affected_event := NEW.event_id; END IF;
    UPDATE public.events SET booked_count = (
      SELECT COALESCE(SUM(quantity), 0) FROM public.bookings
      WHERE event_id = affected_event
        AND status NOT IN ('cancelled', 'denied')
        AND COALESCE(booking_type, 'ticket') NOT IN ('table', 'table_share')
        AND table_id IS NULL
    ) WHERE id = affected_event;
    RETURN COALESCE(NEW, OLD);
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_event_booked_count() FROM PUBLIC, anon, authenticated;
