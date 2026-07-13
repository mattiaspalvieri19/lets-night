-- ============================================================================
-- Let's Night — 00000 BASELINE (fotografia schema public al 2026-07-13)
-- ============================================================================
-- PERCHÉ ESISTE (criticità H1): le migration datate (20260528…20260712) partono
-- a metà storia e fanno solo ALTER/policy: le tabelle base (profiles, venues,
-- events, bookings, …) erano state create A MANO nella dashboard e NON esistevano
-- nel repo. Se il database si perdesse, NON era ricostruibile dal codice.
-- Questo file è quella base mancante: uno snapshot COMPLETO e coerente dello
-- schema `public` così com'è oggi (tabelle + vincoli + indici + funzioni +
-- trigger + RLS), generato per introspezione read-only del DB di produzione.
--
-- COME SI USA (ricostruzione da zero / nuovo ambiente):
--   1) create extension …           (incluso qui sotto)
--   2) QUESTO baseline               → schema public completo, stato ATTUALE
--   3) le policy Storage             → vedi 20260609_venue_covers_storage.sql
--      (venue-covers/avatars) e 20260708_support.sql (support-attachments);
--      i bucket sono ri-creati qui in coda.
--   ⚠️ NON rieseguire le migration datate SOPRA questo baseline: questo file
--      contiene già lo stato finale (tutte le colonne, l'ultima RLS, tutti i
--      trigger, incluso il fix C1). Le migration datate restano come STORICO.
--
-- IDEMPOTENTE / NON DISTRUTTIVO: CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE
-- FUNCTION, DROP … IF EXISTS + CREATE per trigger/policy, CREATE INDEX IF NOT
-- EXISTS. Applicato al DB attuale (dove tutto già esiste) è un no-op sicuro: le
-- tabelle vengono saltate, funzioni/trigger/policy ri-affermati identici.
--
-- FUORI SCOPO (non nel public schema): utenti auth.users, oggetti in storage.*,
-- grant di ruolo di default (Supabase li applica da sé su un progetto nuovo).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- ============================================================================
-- 1) TABELLE  (ordine rispettoso delle foreign key)
-- ============================================================================

-- profiles: 1 riga per utente auth, creata dal trigger on_auth_user_created
CREATE TABLE IF NOT EXISTS public.profiles (
  id               uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role             text NOT NULL DEFAULT 'user'
                     CHECK (role = ANY (ARRAY['user','business'])),
  full_name        text,
  phone            text,
  city             text,
  created_at       timestamptz DEFAULT now(),
  birth_date       date,
  display_name     text,
  username         text,
  bio              text,
  avatar_url       text,
  interests        text[] DEFAULT '{}'::text[],
  loyalty_points   integer DEFAULT 0,
  loyalty_level    text DEFAULT 'Member',
  privacy_settings jsonb DEFAULT '{"searchable": true, "show_badges": true, "show_photos": true, "show_followers": true, "show_following": true, "show_past_events": true, "profile_visibility": "public", "show_future_events": true, "show_favorite_venues": true}'::jsonb,
  gender           text CHECK (gender IS NULL OR (gender = ANY (ARRAY['M','F','X']))),
  push_token       text,
  language         text CHECK (language IS NULL OR (language = ANY (ARRAY['it','en','es','fr'])))
);

-- admins: unica fonte di verità per i privilegi admin (referenziata ovunque)
CREATE TABLE IF NOT EXISTS public.admins (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.venues (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text,
  category      text NOT NULL,
  city          text NOT NULL CHECK (city = ANY (ARRAY['Milano','Roma'])),
  zona          text,
  address       text,
  phone         text,
  email         text,
  website       text,
  instagram     text,
  cover_image   text,
  is_verified   boolean DEFAULT false,
  created_at    timestamptz DEFAULT now(),
  contact_email text,
  is_partner    boolean DEFAULT false,
  partner_since timestamptz,
  external_source text,
  external_id   text
);

CREATE TABLE IF NOT EXISTS public.events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id     uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  title        text NOT NULL,
  description  text,
  category     text NOT NULL
                 CHECK (category = ANY (ARRAY['Discoteca','Universitario','Cena Show','VIP','Aperitivo'])),
  event_date   date NOT NULL,
  event_time   time without time zone NOT NULL,
  price        numeric NOT NULL DEFAULT 0,
  capacity     integer NOT NULL DEFAULT 100,
  booked_count integer DEFAULT 0,
  cover_image  text,
  is_sponsored boolean DEFAULT false,
  is_hot       boolean DEFAULT false,
  is_active    boolean DEFAULT true,
  created_at   timestamptz DEFAULT now(),
  source       text DEFAULT 'manual'
                 CHECK (source = ANY (ARRAY['manual','scraped','partner'])),
  source_url   text,
  scraped_at   timestamptz,
  external_id  text,
  ticket_url   text,
  source_name  text,
  area         text,
  end_time     time without time zone,
  music_type   text,
  dress_code   text,
  age_target   text,
  tags         text[] DEFAULT '{}'::text[],
  has_tables   boolean DEFAULT false,
  table_price  numeric
);

CREATE TABLE IF NOT EXISTS public.scraping_sources (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  source_type          text NOT NULL
                         CHECK (source_type = ANY (ARRAY['instagram','website','eventbrite','dice','facebook','other'])),
  url                  text NOT NULL,
  city                 text CHECK (city = ANY (ARRAY['Milano','Roma'])),
  venue_id             uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  last_scraped_at      timestamptz,
  scrape_frequency     text DEFAULT 'daily'
                         CHECK (scrape_frequency = ANY (ARRAY['hourly','daily','weekly'])),
  is_active            boolean DEFAULT true,
  events_scraped_count integer DEFAULT 0,
  notes                text,
  created_at           timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.favorite_venues (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id   uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, venue_id)
);

CREATE TABLE IF NOT EXISTS public.follows (
  follower_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   timestamptz DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);

CREATE TABLE IF NOT EXISTS public.event_interests (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id   uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);

CREATE TABLE IF NOT EXISTS public.loyalty_milestones (
  id          text PRIMARY KEY,
  title       text NOT NULL,
  description text,
  points      integer DEFAULT 0,
  goal        integer DEFAULT 1,
  icon        text,
  category    text
);

CREATE TABLE IF NOT EXISTS public.user_milestones (
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  milestone_id text NOT NULL REFERENCES public.loyalty_milestones(id) ON DELETE CASCADE,
  progress     integer DEFAULT 0,
  unlocked_at  timestamptz,
  PRIMARY KEY (user_id, milestone_id)
);

CREATE TABLE IF NOT EXISTS public.event_table_types (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name         text NOT NULL,
  total_price  numeric NOT NULL CHECK (total_price >= 0::numeric),
  max_people   integer NOT NULL DEFAULT 8 CHECK (max_people >= 1 AND max_people <= 30),
  includes     text,
  tables_count integer NOT NULL DEFAULT 1 CHECK (tables_count >= 0),
  created_at   timestamptz DEFAULT now(),
  combined_from uuid[]
);

CREATE TABLE IF NOT EXISTS public.event_tables (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  type_id           uuid NOT NULL REFERENCES public.event_table_types(id),
  created_by        uuid NOT NULL REFERENCES public.profiles(id),
  visibility        text NOT NULL DEFAULT 'public'
                      CHECK (visibility = ANY (ARRAY['public','private'])),
  status            text NOT NULL DEFAULT 'open'
                      CHECK (status = ANY (ARRAY['open','covered','cancelled'])),
  total_price       numeric NOT NULL,
  max_people        integer NOT NULL,
  people_count      integer NOT NULL DEFAULT 0,
  collected         numeric NOT NULL DEFAULT 0,
  stripe_session_id text UNIQUE,
  created_at        timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bookings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_id            uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  quantity            integer NOT NULL DEFAULT 1,
  total_price         numeric NOT NULL,
  fee                 numeric NOT NULL DEFAULT 1.50,
  status              text DEFAULT 'confirmed'
                        CHECK (status = ANY (ARRAY['pending','confirmed','cancelled','denied'])),
  qr_code             text,
  created_at          timestamptz DEFAULT now(),
  checked_in          boolean DEFAULT false,
  checked_in_at       timestamptz,
  booking_type        text DEFAULT 'ticket'
                        CHECK (booking_type = ANY (ARRAY['ticket','table','table_share'])),
  stripe_session_id   text,
  snapshot_full_name  text,
  refund_reason       text,
  refunded_at         timestamptz,
  table_id            uuid REFERENCES public.event_tables(id),
  refund_requested_at timestamptz,
  refund_request_reason text
);

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category           text NOT NULL
                       CHECK (category = ANY (ARRAY['booking','payment','account','event','bug','other'])),
  subject            text NOT NULL,
  status             text NOT NULL DEFAULT 'open'
                       CHECK (status = ANY (ARRAY['open','in_progress','waiting_user','resolved','closed'])),
  related_booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  related_event_id   uuid REFERENCES public.events(id) ON DELETE SET NULL,
  app_version        text,
  platform           text,
  locale             text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender          text NOT NULL CHECK (sender = ANY (ARRAY['user','admin'])),
  author_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  body            text NOT NULL,
  attachment_path text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_faq (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category   text NOT NULL,
  lang       text NOT NULL DEFAULT 'it'
               CHECK (lang = ANY (ARRAY['it','en','es','fr'])),
  question   text NOT NULL,
  answer     text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type              text NOT NULL
                      CHECK (type = ANY (ARRAY['booking_confirmed','follow','friend_booking','reminder','generic','support'])),
  title             text NOT NULL,
  body              text,
  actor_id          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_id          uuid REFERENCES public.events(id) ON DELETE CASCADE,
  read              boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  booking_id        uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  support_ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.activities (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type         text NOT NULL,
  event_id     uuid REFERENCES public.events(id) ON DELETE CASCADE,
  venue_id     uuid REFERENCES public.venues(id) ON DELETE CASCADE,
  milestone_id text,
  image_url    text,
  caption      text,
  visibility   text DEFAULT 'public',
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wallet_waitlist (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL UNIQUE,
  city       text,
  created_at timestamptz DEFAULT now(),
  source     text DEFAULT 'homepage_teaser'
);

-- ============================================================================
-- 2) INDICI (quelli non impliciti da PK/UNIQUE)
-- ============================================================================
CREATE INDEX IF NOT EXISTS activities_created_at_idx ON public.activities USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS activities_user_id_idx ON public.activities USING btree (user_id);
CREATE INDEX IF NOT EXISTS bookings_event_id_idx ON public.bookings USING btree (event_id);
CREATE UNIQUE INDEX IF NOT EXISTS bookings_qr_code_unique ON public.bookings USING btree (qr_code) WHERE (qr_code IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS bookings_stripe_session_id_uniq ON public.bookings USING btree (stripe_session_id) WHERE (stripe_session_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS bookings_table_idx ON public.bookings USING btree (table_id) WHERE (table_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS bookings_user_event_active_unique ON public.bookings USING btree (user_id, event_id) WHERE (status <> ALL (ARRAY['cancelled','denied']));
CREATE INDEX IF NOT EXISTS bookings_user_id_idx ON public.bookings USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_refund_pending ON public.bookings USING btree (refund_requested_at) WHERE (refund_requested_at IS NOT NULL);
CREATE INDEX IF NOT EXISTS event_interests_event_id_idx ON public.event_interests USING btree (event_id);
CREATE INDEX IF NOT EXISTS event_interests_user_id_idx ON public.event_interests USING btree (user_id);
CREATE INDEX IF NOT EXISTS event_table_types_event_idx ON public.event_table_types USING btree (event_id);
CREATE INDEX IF NOT EXISTS event_tables_event_idx ON public.event_tables USING btree (event_id);
CREATE INDEX IF NOT EXISTS event_tables_type_idx ON public.event_tables USING btree (type_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_external_unique ON public.events USING btree (source, external_id) WHERE (external_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS events_venue_id_idx ON public.events USING btree (venue_id);
CREATE INDEX IF NOT EXISTS favorite_venues_user_id_idx ON public.favorite_venues USING btree (user_id);
CREATE INDEX IF NOT EXISTS follows_follower_id_idx ON public.follows USING btree (follower_id);
CREATE INDEX IF NOT EXISTS follows_following_id_idx ON public.follows USING btree (following_id);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON public.notifications USING btree (user_id) WHERE (read = false);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications USING btree (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique ON public.profiles USING btree (phone) WHERE ((phone IS NOT NULL) AND (phone <> ''::text));
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique ON public.profiles USING btree (lower(username)) WHERE (username IS NOT NULL);
CREATE INDEX IF NOT EXISTS support_faq_lookup_idx ON public.support_faq USING btree (lang, category, is_active);
CREATE INDEX IF NOT EXISTS support_messages_ticket_idx ON public.support_messages USING btree (ticket_id, created_at);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON public.support_tickets USING btree (status);
CREATE INDEX IF NOT EXISTS support_tickets_user_id_idx ON public.support_tickets USING btree (user_id);
CREATE INDEX IF NOT EXISTS user_milestones_user_id_idx ON public.user_milestones USING btree (user_id);
CREATE INDEX IF NOT EXISTS venues_owner_id_idx ON public.venues USING btree (owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS venues_phone_unique ON public.venues USING btree (phone) WHERE ((phone IS NOT NULL) AND (phone <> ''::text));

-- ============================================================================
-- 3) ROW LEVEL SECURITY: abilitazione su tutte le tabelle
-- ============================================================================
ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venues            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scraping_sources  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorite_venues   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_interests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_milestones   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_table_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_tables      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_faq       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_waitlist   ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4) FUNZIONI (trigger + RPC). Tutte SECURITY DEFINER, search_path = public.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  DECLARE
    meta jsonb := NEW.raw_user_meta_data;
    user_role text := COALESCE(meta->>'role', 'user');
  BEGIN
    INSERT INTO public.profiles (id, full_name, role, phone, city, birth_date)
    VALUES (
      NEW.id, meta->>'full_name', user_role, meta->>'phone', meta->>'city',
      CASE WHEN meta ? 'birth_date' THEN (meta->>'birth_date')::date ELSE NULL END
    )
    ON CONFLICT (id) DO UPDATE SET
      full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
      role = EXCLUDED.role,
      phone = COALESCE(EXCLUDED.phone, profiles.phone),
      city = COALESCE(EXCLUDED.city, profiles.city),
      birth_date = COALESCE(EXCLUDED.birth_date, profiles.birth_date);

    IF user_role = 'business' AND meta ? 'venue_name' THEN
      INSERT INTO public.venues (
        owner_id, name, category, city, zona, address, phone, description, contact_email, is_verified
      ) VALUES (
        NEW.id, meta->>'venue_name', COALESCE(meta->>'venue_category', 'Discoteca'),
        COALESCE(meta->>'venue_city', 'Milano'), meta->>'venue_zona', meta->>'venue_address',
        meta->>'venue_phone', meta->>'venue_description', NEW.email, false
      );
    END IF;
    RETURN NEW;
  END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_event_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  DECLARE cap int; taken int;
  BEGIN
    IF NEW.status IN ('cancelled', 'denied') THEN RETURN NEW; END IF;
    IF NEW.booking_type IN ('table', 'table_share') OR NEW.table_id IS NOT NULL THEN RETURN NEW; END IF;
    SELECT capacity INTO cap FROM public.events WHERE id = NEW.event_id FOR UPDATE;
    IF cap IS NULL THEN RETURN NEW; END IF;
    SELECT COALESCE(SUM(quantity), 0) INTO taken FROM public.bookings
    WHERE event_id = NEW.event_id AND status NOT IN ('cancelled', 'denied')
      AND COALESCE(booking_type, 'ticket') NOT IN ('table', 'table_share') AND table_id IS NULL;
    IF taken + NEW.quantity > cap THEN RAISE EXCEPTION 'CAPACITY_FULL' USING ERRCODE = 'check_violation'; END IF;
    RETURN NEW;
  END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_booking_immutability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  BEGIN
    IF NEW.event_id IS DISTINCT FROM OLD.event_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.quantity IS DISTINCT FROM OLD.quantity
       OR NEW.total_price IS DISTINCT FROM OLD.total_price
       OR NEW.fee IS DISTINCT FROM OLD.fee
       OR NEW.booking_type IS DISTINCT FROM OLD.booking_type
       OR NEW.table_id IS DISTINCT FROM OLD.table_id
       OR NEW.stripe_session_id IS DISTINCT FROM OLD.stripe_session_id THEN
      RAISE EXCEPTION 'BOOKING_IMMUTABLE_FIELD' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.qr_code IS DISTINCT FROM OLD.qr_code AND NEW.qr_code IS NOT NULL THEN
      RAISE EXCEPTION 'BOOKING_QR_IMMUTABLE' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_booking_insert_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  ev_price numeric; ev_table_price numeric; effective numeric; jwt_role text;
BEGIN
  jwt_role := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  IF jwt_role IS DISTINCT FROM 'authenticated' THEN RETURN NEW; END IF;
  IF NEW.status IN ('cancelled', 'denied') THEN RETURN NEW; END IF;
  IF NEW.stripe_session_id IS NOT NULL OR NEW.table_id IS NOT NULL
     OR COALESCE(NEW.booking_type, 'ticket') = 'table_share'
     OR COALESCE(NEW.total_price, 0) <> 0 OR COALESCE(NEW.fee, 0) <> 0 THEN
    RAISE EXCEPTION 'BOOKING_PAID_MUST_USE_CHECKOUT: le prenotazioni a pagamento passano dal checkout';
  END IF;
  SELECT price, table_price INTO ev_price, ev_table_price FROM public.events WHERE id = NEW.event_id;
  IF COALESCE(NEW.booking_type, 'ticket') = 'table' THEN
    effective := CASE WHEN ev_table_price IS NOT NULL THEN GREATEST(0, ev_table_price)
                      ELSE GREATEST(0, COALESCE(ev_price, 0)) * 4 END;
  ELSE
    effective := GREATEST(0, COALESCE(ev_price, 0));
  END IF;
  IF effective > 0 THEN
    RAISE EXCEPTION 'BOOKING_PAID_EVENT_REQUIRES_PAYMENT: evento a pagamento, serve il checkout';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_table_availability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  DECLARE total int; taken int;
  BEGIN
    IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;
    SELECT tables_count INTO total FROM public.event_table_types WHERE id = NEW.type_id FOR UPDATE;
    IF total IS NULL THEN RAISE EXCEPTION 'TABLE_TYPE_NOT_FOUND' USING ERRCODE = 'check_violation'; END IF;
    SELECT count(*) INTO taken FROM public.event_tables WHERE type_id = NEW.type_id AND status <> 'cancelled';
    IF taken + 1 > total THEN RAISE EXCEPTION 'TABLES_FULL' USING ERRCODE = 'check_violation'; END IF;
    RETURN NEW;
  END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_table_share()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  DECLARE t record; seats int; paid numeric;
  BEGIN
    IF NEW.table_id IS NULL THEN RETURN NEW; END IF;
    IF NEW.status IN ('cancelled','denied') THEN RETURN NEW; END IF;
    SELECT * INTO t FROM public.event_tables WHERE id = NEW.table_id FOR UPDATE;
    IF t IS NULL THEN RAISE EXCEPTION 'TABLE_NOT_FOUND' USING ERRCODE = 'check_violation'; END IF;
    IF t.status = 'cancelled' THEN RAISE EXCEPTION 'TABLE_CANCELLED' USING ERRCODE = 'check_violation'; END IF;
    SELECT count(*) INTO seats FROM public.bookings WHERE table_id = NEW.table_id AND status NOT IN ('cancelled','denied');
    IF seats + 1 > t.max_people THEN RAISE EXCEPTION 'TABLE_SEATS_FULL' USING ERRCODE = 'check_violation'; END IF;
    SELECT COALESCE(SUM(total_price), 0) INTO paid FROM public.bookings WHERE table_id = NEW.table_id AND status NOT IN ('cancelled','denied');
    IF NEW.total_price > 0 THEN
      IF t.status <> 'open' THEN RAISE EXCEPTION 'TABLE_NOT_OPEN' USING ERRCODE = 'check_violation'; END IF;
      IF NEW.total_price < 10 THEN RAISE EXCEPTION 'SHARE_BELOW_MIN' USING ERRCODE = 'check_violation'; END IF;
      IF paid + NEW.total_price > t.total_price THEN RAISE EXCEPTION 'SHARE_EXCEEDS_REMAINING' USING ERRCODE = 'check_violation'; END IF;
    END IF;
    RETURN NEW;
  END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_table_aggregates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  DECLARE tid uuid; seats int; paid numeric;
  BEGIN
    tid := COALESCE(NEW.table_id, OLD.table_id);
    IF tid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
    SELECT count(*), COALESCE(SUM(total_price), 0) INTO seats, paid
    FROM public.bookings WHERE table_id = tid AND status NOT IN ('cancelled','denied');
    UPDATE public.event_tables
    SET people_count = seats, collected = paid,
        status = CASE WHEN status = 'cancelled' THEN status
                      WHEN paid >= total_price THEN 'covered' ELSE 'open' END
    WHERE id = tid;
    RETURN COALESCE(NEW, OLD);
  END;
$function$;

CREATE OR REPLACE FUNCTION public.update_event_booked_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  DECLARE affected_event uuid;
  BEGIN
    IF TG_OP = 'DELETE' THEN affected_event := OLD.event_id; ELSE affected_event := NEW.event_id; END IF;
    UPDATE public.events SET booked_count = (
      SELECT COALESCE(SUM(quantity), 0) FROM public.bookings
      WHERE event_id = affected_event AND status NOT IN ('cancelled','denied')
        AND COALESCE(booking_type,'ticket') NOT IN ('table','table_share') AND table_id IS NULL
    ) WHERE id = affected_event;
    RETURN COALESCE(NEW, OLD);
  EXCEPTION WHEN OTHERS THEN RETURN COALESCE(NEW, OLD);
  END;
$function$;

CREATE OR REPLACE FUNCTION public.update_loyalty_on_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  DECLARE point_value integer := 10; total_bookings integer; was_active boolean; is_active boolean;
  BEGIN
    IF TG_OP = 'INSERT' AND NEW.status NOT IN ('cancelled','denied') THEN
      UPDATE public.profiles SET loyalty_points = COALESCE(loyalty_points,0) + point_value WHERE id = NEW.user_id;
    ELSIF TG_OP = 'DELETE' AND OLD.status NOT IN ('cancelled','denied') THEN
      UPDATE public.profiles SET loyalty_points = GREATEST(0, COALESCE(loyalty_points,0) - point_value) WHERE id = OLD.user_id;
    ELSIF TG_OP = 'UPDATE' THEN
      was_active := OLD.status NOT IN ('cancelled','denied');
      is_active  := NEW.status NOT IN ('cancelled','denied');
      IF NOT was_active AND is_active THEN
        UPDATE public.profiles SET loyalty_points = COALESCE(loyalty_points,0) + point_value WHERE id = NEW.user_id;
      ELSIF was_active AND NOT is_active THEN
        UPDATE public.profiles SET loyalty_points = GREATEST(0, COALESCE(loyalty_points,0) - point_value) WHERE id = NEW.user_id;
      END IF;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      UPDATE public.profiles SET loyalty_level = CASE
        WHEN loyalty_points >= 1500 THEN 'VIP'
        WHEN loyalty_points >= 600  THEN 'Elite'
        WHEN loyalty_points >= 200  THEN 'Insider'
        ELSE 'Member' END WHERE id = NEW.user_id;
      SELECT COUNT(*) INTO total_bookings FROM public.bookings
      WHERE user_id = NEW.user_id AND status NOT IN ('cancelled','denied');
      IF total_bookings >= 1 THEN
        INSERT INTO public.user_milestones (user_id, milestone_id, progress, unlocked_at)
        VALUES (NEW.user_id, 'first_booking', 1, now())
        ON CONFLICT (user_id, milestone_id) DO UPDATE SET progress = 1, unlocked_at = COALESCE(user_milestones.unlocked_at, now());
      END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
  EXCEPTION WHEN OTHERS THEN RETURN COALESCE(NEW, OLD);
  END;
$function$;

CREATE OR REPLACE FUNCTION public.create_activity_on_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  DECLARE user_privacy jsonb; vis text := 'public';
  BEGIN
    IF NEW.status IN ('cancelled','denied') THEN RETURN NEW; END IF;
    SELECT privacy_settings INTO user_privacy FROM public.profiles WHERE id = NEW.user_id;
    IF user_privacy IS NOT NULL THEN
      IF (user_privacy->>'show_future_events')::boolean IS FALSE THEN vis := 'private'; END IF;
      IF user_privacy->>'profile_visibility' = 'followers' THEN vis := 'followers'; END IF;
      IF user_privacy->>'profile_visibility' = 'private' THEN vis := 'private'; END IF;
    END IF;
    INSERT INTO public.activities (user_id, type, event_id, visibility)
    VALUES (NEW.user_id, 'booking_made', NEW.event_id, vis);
    RETURN NEW;
  EXCEPTION WHEN OTHERS THEN RETURN NEW;
  END;
$function$;

CREATE OR REPLACE FUNCTION public.create_activity_on_favorite()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE user_privacy jsonb; vis text := 'public'; total_favs integer;
BEGIN
  SELECT privacy_settings INTO user_privacy FROM public.profiles WHERE id = NEW.user_id;
  IF user_privacy IS NOT NULL THEN
    IF (user_privacy->>'show_favorite_venues')::boolean IS FALSE THEN vis := 'private'; END IF;
    IF user_privacy->>'profile_visibility' = 'followers' THEN vis := 'followers'; END IF;
    IF user_privacy->>'profile_visibility' = 'private' THEN vis := 'private'; END IF;
  END IF;
  INSERT INTO public.activities (user_id, type, venue_id, visibility)
  VALUES (NEW.user_id, 'venue_favorited', NEW.venue_id, vis);
  SELECT COUNT(*) INTO total_favs FROM public.favorite_venues WHERE user_id = NEW.user_id;
  IF total_favs >= 1 THEN
    INSERT INTO public.user_milestones (user_id, milestone_id, progress, unlocked_at)
    VALUES (NEW.user_id, 'first_favorite', 1, now())
    ON CONFLICT (user_id, milestone_id) DO UPDATE SET
      progress = 1, unlocked_at = COALESCE(user_milestones.unlocked_at, now());
    UPDATE public.profiles SET loyalty_points = COALESCE(loyalty_points, 0) + 20
      WHERE id = NEW.user_id
      AND NOT EXISTS (
        SELECT 1 FROM public.activities WHERE user_id = NEW.user_id
        AND type = 'badge_unlocked' AND milestone_id = 'first_favorite'
      );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_activity_on_milestone()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE user_privacy jsonb; vis text := 'public';
BEGIN
  IF NEW.unlocked_at IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.unlocked_at IS NOT NULL THEN RETURN NEW; END IF;
  SELECT privacy_settings INTO user_privacy FROM public.profiles WHERE id = NEW.user_id;
  IF user_privacy IS NOT NULL THEN
    IF (user_privacy->>'show_badges')::boolean IS FALSE THEN vis := 'private'; END IF;
    IF user_privacy->>'profile_visibility' = 'followers' THEN vis := 'followers'; END IF;
    IF user_privacy->>'profile_visibility' = 'private' THEN vis := 'private'; END IF;
  END IF;
  INSERT INTO public.activities (user_id, type, milestone_id, visibility)
  VALUES (NEW.user_id, 'badge_unlocked', NEW.milestone_id, vis);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_on_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  DECLARE ev_title text; ev_date date; booker_name text; notify_followers boolean; show_future boolean; is_table boolean;
  BEGIN
    IF NEW.status <> 'confirmed' THEN RETURN NEW; END IF;
    IF coalesce(NEW.booking_type,'ticket') NOT IN ('ticket','table','table_share') THEN RETURN NEW; END IF;
    SELECT e.title, e.event_date INTO ev_title, ev_date FROM events e WHERE e.id = NEW.event_id;
    IF ev_title IS NULL THEN RETURN NEW; END IF;
    IF ev_date < current_date THEN RETURN NEW; END IF;
    is_table := (NEW.booking_type = 'table_share') OR (NEW.table_id IS NOT NULL);
    INSERT INTO notifications (user_id, type, title, body, event_id, booking_id)
    VALUES (NEW.user_id, 'booking_confirmed',
      CASE WHEN is_table THEN 'Tavolo confermato' ELSE 'Ingresso confermato' END,
      ev_title || ' · ' || to_char(ev_date,'DD/MM') || ' — il tuo QR è pronto', NEW.event_id, NEW.id);
    SELECT coalesce((p.privacy_settings->>'notify_followers_on_booking')::boolean, false),
           coalesce((p.privacy_settings->>'show_future_events')::boolean, true)
      INTO notify_followers, show_future FROM profiles p WHERE p.id = NEW.user_id;
    IF notify_followers AND show_future THEN
      SELECT coalesce(display_name, full_name, 'Un amico') INTO booker_name FROM profiles WHERE id = NEW.user_id;
      INSERT INTO notifications (user_id, type, title, body, actor_id, event_id)
      SELECT f.follower_id, 'friend_booking', booker_name || ' esce',
        'Va a ' || ev_title || ' (' || to_char(ev_date,'DD/MM') || ') — prenota anche tu', NEW.user_id, NEW.event_id
      FROM follows f WHERE f.following_id = NEW.user_id;
    END IF;
    RETURN NEW;
  EXCEPTION WHEN OTHERS THEN RETURN NEW;
  END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_on_follow()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  DECLARE actor_name text;
  BEGIN
    SELECT coalesce(display_name, full_name, 'Qualcuno') INTO actor_name FROM profiles WHERE id = NEW.follower_id;
    INSERT INTO notifications (user_id, type, title, body, actor_id)
    VALUES (NEW.following_id, 'follow', 'Nuovo follower', actor_name || ' ha iniziato a seguirti', NEW.follower_id);
    RETURN NEW;
  EXCEPTION WHEN OTHERS THEN RETURN NEW;
  END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_on_support_reply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE ticket_owner uuid; ticket_subj text;
BEGIN
  IF NEW.sender <> 'admin' THEN RETURN NEW; END IF;
  SELECT user_id, subject INTO ticket_owner, ticket_subj FROM support_tickets WHERE id = NEW.ticket_id;
  IF ticket_owner IS NULL THEN RETURN NEW; END IF;
  UPDATE support_tickets SET status = 'waiting_user', updated_at = now() WHERE id = NEW.ticket_id;
  INSERT INTO notifications (user_id, type, title, body, support_ticket_id)
  VALUES (ticket_owner, 'support', 'Risposta dall''assistenza',
    'Hai una risposta al tuo ticket: ' || coalesce(ticket_subj, ''), NEW.ticket_id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.touch_support_ticket()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE support_tickets SET updated_at = now() WHERE id = NEW.ticket_id;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$function$;

-- RPC chiamate dall'app / area admin (non trigger)
CREATE OR REPLACE FUNCTION public.admin_list_admin_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT a.user_id FROM public.admins a
  WHERE EXISTS (SELECT 1 FROM public.admins x WHERE x.user_id = auth.uid());
$function$;

CREATE OR REPLACE FUNCTION public.check_phone_available(p_phone text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  BEGIN
    IF p_phone IS NULL OR p_phone = '' THEN RETURN true; END IF;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE phone = p_phone) THEN RETURN false; END IF;
    IF EXISTS (SELECT 1 FROM public.venues WHERE phone = p_phone) THEN RETURN false; END IF;
    RETURN true;
  END;
$function$;

CREATE OR REPLACE FUNCTION public.check_username_available(p_username text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF p_username IS NULL OR p_username = '' THEN RETURN true; END IF;
  RETURN NOT EXISTS (SELECT 1 FROM public.profiles WHERE LOWER(username) = LOWER(p_username));
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_combine_table_types(p_event_id uuid, p_source_type_ids uuid[], p_tables_count integer, p_name text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  src record; distinct_ids uuid[]; found int := 0; free_count int;
  sum_price numeric := 0; sum_people int := 0; names text := ''; new_id uuid;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() NOT IN (SELECT user_id FROM public.admins) THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT ARRAY(SELECT DISTINCT unnest(p_source_type_ids)) INTO distinct_ids;
  IF distinct_ids IS NULL OR COALESCE(array_length(distinct_ids, 1), 0) < 2 THEN
    RAISE EXCEPTION 'NEED_AT_LEAST_TWO_TYPES' USING ERRCODE = 'check_violation';
  END IF;
  IF p_tables_count IS NULL OR p_tables_count < 1 THEN
    RAISE EXCEPTION 'INVALID_TABLES_COUNT' USING ERRCODE = 'check_violation';
  END IF;
  FOR src IN SELECT * FROM public.event_table_types WHERE id = ANY(distinct_ids) ORDER BY id FOR UPDATE LOOP
    found := found + 1;
    IF src.event_id IS DISTINCT FROM p_event_id THEN RAISE EXCEPTION 'TYPE_NOT_IN_EVENT' USING ERRCODE = 'check_violation'; END IF;
    IF src.combined_from IS NOT NULL THEN RAISE EXCEPTION 'CANNOT_COMBINE_COMBINED' USING ERRCODE = 'check_violation'; END IF;
    SELECT src.tables_count - count(*) INTO free_count FROM public.event_tables WHERE type_id = src.id AND status <> 'cancelled';
    IF free_count < p_tables_count THEN RAISE EXCEPTION 'INSUFFICIENT_FREE_TABLES' USING ERRCODE = 'check_violation'; END IF;
    sum_price := sum_price + src.total_price;
    sum_people := sum_people + src.max_people;
    names := names || CASE WHEN names = '' THEN '' ELSE ' + ' END || src.name;
  END LOOP;
  IF found <> array_length(distinct_ids, 1) THEN RAISE EXCEPTION 'TYPE_NOT_FOUND' USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.event_table_types SET tables_count = tables_count - p_tables_count WHERE id = ANY(distinct_ids);
  INSERT INTO public.event_table_types (event_id, name, total_price, max_people, includes, tables_count, combined_from)
  VALUES (p_event_id, COALESCE(NULLIF(trim(p_name), ''), 'Combinato: ' || names), sum_price, LEAST(sum_people, 30),
          'Tavolo combinato (' || names || ')', p_tables_count, distinct_ids)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_dissolve_combined_type(p_type_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE t record; inst_count int; src_id uuid;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() NOT IN (SELECT user_id FROM public.admins) THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO t FROM public.event_table_types WHERE id = p_type_id FOR UPDATE;
  IF t IS NULL THEN RAISE EXCEPTION 'TYPE_NOT_FOUND' USING ERRCODE = 'check_violation'; END IF;
  IF t.combined_from IS NULL THEN RAISE EXCEPTION 'NOT_A_COMBINED_TYPE' USING ERRCODE = 'check_violation'; END IF;
  SELECT count(*) INTO inst_count FROM public.event_tables WHERE type_id = p_type_id;
  IF inst_count > 0 THEN RAISE EXCEPTION 'TYPE_HAS_TABLES' USING ERRCODE = 'check_violation'; END IF;
  FOR src_id IN SELECT unnest(t.combined_from) ORDER BY 1 LOOP
    UPDATE public.event_table_types SET tables_count = tables_count + t.tables_count WHERE id = src_id;
  END LOOP;
  DELETE FROM public.event_table_types WHERE id = p_type_id;
END;
$function$;

-- Igiene: le funzioni-trigger non devono essere invocabili direttamente dai client
REVOKE EXECUTE ON FUNCTION public.enforce_event_capacity()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_booking_immutability()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_booking_insert_payment()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_table_availability()    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_table_share()           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_table_aggregates()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_event_booked_count()     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_loyalty_on_booking()     FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 5) TRIGGER
-- ============================================================================
-- auth.users → crea profilo (e venue se business)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- bookings
DROP TRIGGER IF EXISTS trg_enforce_event_capacity ON public.bookings;
CREATE TRIGGER trg_enforce_event_capacity BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_capacity();

DROP TRIGGER IF EXISTS trg_guard_booking_insert_payment ON public.bookings;
CREATE TRIGGER trg_guard_booking_insert_payment BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_insert_payment();

DROP TRIGGER IF EXISTS trg_enforce_table_share ON public.bookings;
CREATE TRIGGER trg_enforce_table_share BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_table_share();

DROP TRIGGER IF EXISTS trg_enforce_booking_immutability ON public.bookings;
CREATE TRIGGER trg_enforce_booking_immutability BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_immutability();

DROP TRIGGER IF EXISTS bookings_after_change ON public.bookings;
CREATE TRIGGER bookings_after_change AFTER INSERT OR DELETE OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_event_booked_count();

DROP TRIGGER IF EXISTS bookings_loyalty_update ON public.bookings;
CREATE TRIGGER bookings_loyalty_update AFTER INSERT OR DELETE OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_loyalty_on_booking();

DROP TRIGGER IF EXISTS bookings_create_activity ON public.bookings;
CREATE TRIGGER bookings_create_activity AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.create_activity_on_booking();

DROP TRIGGER IF EXISTS trg_notify_on_booking ON public.bookings;
CREATE TRIGGER trg_notify_on_booking AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_booking();

DROP TRIGGER IF EXISTS trg_sync_table_aggregates ON public.bookings;
CREATE TRIGGER trg_sync_table_aggregates AFTER INSERT OR DELETE OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.sync_table_aggregates();

-- event_tables
DROP TRIGGER IF EXISTS trg_enforce_table_availability ON public.event_tables;
CREATE TRIGGER trg_enforce_table_availability BEFORE INSERT ON public.event_tables
  FOR EACH ROW EXECUTE FUNCTION public.enforce_table_availability();

-- favorite_venues
DROP TRIGGER IF EXISTS favorites_create_activity ON public.favorite_venues;
CREATE TRIGGER favorites_create_activity AFTER INSERT ON public.favorite_venues
  FOR EACH ROW EXECUTE FUNCTION public.create_activity_on_favorite();

-- follows
DROP TRIGGER IF EXISTS trg_notify_on_follow ON public.follows;
CREATE TRIGGER trg_notify_on_follow AFTER INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_follow();

-- user_milestones
DROP TRIGGER IF EXISTS user_milestones_create_activity ON public.user_milestones;
CREATE TRIGGER user_milestones_create_activity AFTER INSERT OR UPDATE ON public.user_milestones
  FOR EACH ROW EXECUTE FUNCTION public.create_activity_on_milestone();

-- support_messages
DROP TRIGGER IF EXISTS trg_notify_on_support_reply ON public.support_messages;
CREATE TRIGGER trg_notify_on_support_reply AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_support_reply();

DROP TRIGGER IF EXISTS trg_touch_support_ticket ON public.support_messages;
CREATE TRIGGER trg_touch_support_ticket AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_support_ticket();

-- ============================================================================
-- 6) POLICY RLS
-- ============================================================================

-- profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO public
  USING (auth.uid() = id);
DROP POLICY IF EXISTS "Anyone can view searchable profiles" ON public.profiles;
CREATE POLICY "Anyone can view searchable profiles" ON public.profiles FOR SELECT TO anon, authenticated
  USING (COALESCE(((privacy_settings ->> 'searchable'::text))::boolean, true) IS NOT FALSE);
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() IN (SELECT admins.user_id FROM admins));
DROP POLICY IF EXISTS "Venue owners can view bookers profiles" ON public.profiles;
CREATE POLICY "Venue owners can view bookers profiles" ON public.profiles FOR SELECT TO authenticated
  USING ((id IN (SELECT b.user_id FROM ((bookings b JOIN events e ON ((e.id = b.event_id))) JOIN venues v ON ((v.id = e.venue_id))) WHERE ((v.owner_id = auth.uid()) AND (b.status <> 'cancelled'::text)))) OR (auth.uid() IN (SELECT admins.user_id FROM admins)));
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO public
  USING (auth.uid() = id);

-- admins
DROP POLICY IF EXISTS "Users can read own admin row" ON public.admins;
CREATE POLICY "Users can read own admin row" ON public.admins FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- venues
DROP POLICY IF EXISTS "Anyone can view venues" ON public.venues;
CREATE POLICY "Anyone can view venues" ON public.venues FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Owners can insert own venues" ON public.venues;
CREATE POLICY "Owners can insert own venues" ON public.venues FOR INSERT TO public
  WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS "Owners and admins can update venues" ON public.venues;
CREATE POLICY "Owners and admins can update venues" ON public.venues FOR UPDATE TO authenticated
  USING ((auth.uid() = owner_id) OR (auth.uid() IN (SELECT admins.user_id FROM admins)))
  WITH CHECK ((auth.uid() = owner_id) OR (auth.uid() IN (SELECT admins.user_id FROM admins)));
DROP POLICY IF EXISTS "Owners and admins can delete venues" ON public.venues;
CREATE POLICY "Owners and admins can delete venues" ON public.venues FOR DELETE TO authenticated
  USING ((auth.uid() = owner_id) OR (auth.uid() IN (SELECT admins.user_id FROM admins)));

-- events
DROP POLICY IF EXISTS "Public can view verified or scraped events" ON public.events;
CREATE POLICY "Public can view verified or scraped events" ON public.events FOR SELECT TO public
  USING ((is_active = true) AND ((venue_id IN (SELECT venues.id FROM venues WHERE (venues.is_verified = true))) OR (source = 'scraped'::text)));
DROP POLICY IF EXISTS "Venue owners can view own events" ON public.events;
CREATE POLICY "Venue owners can view own events" ON public.events FOR SELECT TO public
  USING (venue_id IN (SELECT venues.id FROM venues WHERE (venues.owner_id = auth.uid())));
DROP POLICY IF EXISTS "Admins can view all events" ON public.events;
CREATE POLICY "Admins can view all events" ON public.events FOR SELECT TO authenticated
  USING (auth.uid() IN (SELECT admins.user_id FROM admins));
DROP POLICY IF EXISTS "Venue owners can insert events" ON public.events;
CREATE POLICY "Venue owners can insert events" ON public.events FOR INSERT TO public
  WITH CHECK (venue_id IN (SELECT venues.id FROM venues WHERE (venues.owner_id = auth.uid())));
DROP POLICY IF EXISTS "Admins can insert events" ON public.events;
CREATE POLICY "Admins can insert events" ON public.events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IN (SELECT admins.user_id FROM admins));
DROP POLICY IF EXISTS "Venue owners can update events" ON public.events;
CREATE POLICY "Venue owners can update events" ON public.events FOR UPDATE TO public
  USING (venue_id IN (SELECT venues.id FROM venues WHERE (venues.owner_id = auth.uid())));
DROP POLICY IF EXISTS "Admins can update any event" ON public.events;
CREATE POLICY "Admins can update any event" ON public.events FOR UPDATE TO authenticated
  USING (auth.uid() IN (SELECT admins.user_id FROM admins))
  WITH CHECK (auth.uid() IN (SELECT admins.user_id FROM admins));
DROP POLICY IF EXISTS "Venue owners can delete events" ON public.events;
CREATE POLICY "Venue owners can delete events" ON public.events FOR DELETE TO public
  USING (venue_id IN (SELECT venues.id FROM venues WHERE (venues.owner_id = auth.uid())));
DROP POLICY IF EXISTS "Admins can delete any event" ON public.events;
CREATE POLICY "Admins can delete any event" ON public.events FOR DELETE TO authenticated
  USING (auth.uid() IN (SELECT admins.user_id FROM admins));

-- scraping_sources
DROP POLICY IF EXISTS "Admins can manage scraping sources" ON public.scraping_sources;
CREATE POLICY "Admins can manage scraping sources" ON public.scraping_sources FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT admins.user_id FROM admins))
  WITH CHECK (auth.uid() IN (SELECT admins.user_id FROM admins));

-- favorite_venues
DROP POLICY IF EXISTS "Public can read favorites" ON public.favorite_venues;
CREATE POLICY "Public can read favorites" ON public.favorite_venues FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Users manage own favorites" ON public.favorite_venues;
CREATE POLICY "Users manage own favorites" ON public.favorite_venues FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- follows
DROP POLICY IF EXISTS "Public can read follows" ON public.follows;
CREATE POLICY "Public can read follows" ON public.follows FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Users can follow others" ON public.follows;
CREATE POLICY "Users can follow others" ON public.follows FOR INSERT TO authenticated
  WITH CHECK (follower_id = auth.uid());
DROP POLICY IF EXISTS "Users can unfollow" ON public.follows;
CREATE POLICY "Users can unfollow" ON public.follows FOR DELETE TO authenticated
  USING (follower_id = auth.uid());

-- event_interests
DROP POLICY IF EXISTS "Public can count interests" ON public.event_interests;
CREATE POLICY "Public can count interests" ON public.event_interests FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Users manage own interests" ON public.event_interests;
CREATE POLICY "Users manage own interests" ON public.event_interests FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- loyalty_milestones
DROP POLICY IF EXISTS "Catalog readable by all" ON public.loyalty_milestones;
CREATE POLICY "Catalog readable by all" ON public.loyalty_milestones FOR SELECT TO anon, authenticated USING (true);

-- user_milestones
DROP POLICY IF EXISTS "Public reads unlocked milestones" ON public.user_milestones;
CREATE POLICY "Public reads unlocked milestones" ON public.user_milestones FOR SELECT TO anon, authenticated
  USING (unlocked_at IS NOT NULL);
DROP POLICY IF EXISTS "Users manage own milestones" ON public.user_milestones;
CREATE POLICY "Users manage own milestones" ON public.user_milestones FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- event_table_types
DROP POLICY IF EXISTS "Table types readable by all" ON public.event_table_types;
CREATE POLICY "Table types readable by all" ON public.event_table_types FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Venue owners manage table types" ON public.event_table_types;
CREATE POLICY "Venue owners manage table types" ON public.event_table_types FOR ALL TO authenticated
  USING (event_id IN (SELECT e.id FROM (events e JOIN venues v ON ((v.id = e.venue_id))) WHERE (v.owner_id = auth.uid())))
  WITH CHECK (event_id IN (SELECT e.id FROM (events e JOIN venues v ON ((v.id = e.venue_id))) WHERE (v.owner_id = auth.uid())));
DROP POLICY IF EXISTS "Admins manage table types" ON public.event_table_types;
CREATE POLICY "Admins manage table types" ON public.event_table_types FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT admins.user_id FROM admins))
  WITH CHECK (auth.uid() IN (SELECT admins.user_id FROM admins));

-- event_tables
DROP POLICY IF EXISTS "Tables visible by visibility" ON public.event_tables;
CREATE POLICY "Tables visible by visibility" ON public.event_tables FOR SELECT TO public
  USING ((visibility = 'public'::text) OR (created_by = auth.uid()) OR (id IN (SELECT b.table_id FROM bookings b WHERE ((b.user_id = auth.uid()) AND (b.table_id IS NOT NULL)))) OR (event_id IN (SELECT e.id FROM (events e JOIN venues v ON ((v.id = e.venue_id))) WHERE (v.owner_id = auth.uid()))) OR (auth.uid() IN (SELECT admins.user_id FROM admins)));
DROP POLICY IF EXISTS "Admins can update event tables" ON public.event_tables;
CREATE POLICY "Admins can update event tables" ON public.event_tables FOR UPDATE TO authenticated
  USING (auth.uid() IN (SELECT admins.user_id FROM admins))
  WITH CHECK (auth.uid() IN (SELECT admins.user_id FROM admins));
DROP POLICY IF EXISTS "Admins can delete event tables" ON public.event_tables;
CREATE POLICY "Admins can delete event tables" ON public.event_tables FOR DELETE TO authenticated
  USING (auth.uid() IN (SELECT admins.user_id FROM admins));

-- bookings
DROP POLICY IF EXISTS "Users can view own bookings" ON public.bookings;
CREATE POLICY "Users can view own bookings" ON public.bookings FOR SELECT TO public
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Venue owners can view bookings for their events" ON public.bookings;
CREATE POLICY "Venue owners can view bookings for their events" ON public.bookings FOR SELECT TO authenticated
  USING (event_id IN (SELECT events.id FROM events WHERE (events.venue_id IN (SELECT venues.id FROM venues WHERE (venues.owner_id = auth.uid())))));
DROP POLICY IF EXISTS "Admins can view all bookings" ON public.bookings;
CREATE POLICY "Admins can view all bookings" ON public.bookings FOR SELECT TO authenticated
  USING (auth.uid() IN (SELECT admins.user_id FROM admins));
DROP POLICY IF EXISTS "Users can create own bookings" ON public.bookings;
CREATE POLICY "Users can create own bookings" ON public.bookings FOR INSERT TO public
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can cancel own bookings" ON public.bookings;
CREATE POLICY "Users can cancel own bookings" ON public.bookings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK ((auth.uid() = user_id) AND (status = 'cancelled'::text));
DROP POLICY IF EXISTS "Venue owners can check in bookings" ON public.bookings;
CREATE POLICY "Venue owners can check in bookings" ON public.bookings FOR UPDATE TO authenticated
  USING (event_id IN (SELECT events.id FROM events WHERE (events.venue_id IN (SELECT venues.id FROM venues WHERE (venues.owner_id = auth.uid())))))
  WITH CHECK (event_id IN (SELECT events.id FROM events WHERE (events.venue_id IN (SELECT venues.id FROM venues WHERE (venues.owner_id = auth.uid())))));
DROP POLICY IF EXISTS "Admins can update all bookings" ON public.bookings;
CREATE POLICY "Admins can update all bookings" ON public.bookings FOR UPDATE TO authenticated
  USING (auth.uid() IN (SELECT admins.user_id FROM admins))
  WITH CHECK (auth.uid() IN (SELECT admins.user_id FROM admins));

-- support_tickets
DROP POLICY IF EXISTS "tickets_user_select" ON public.support_tickets;
CREATE POLICY "tickets_user_select" ON public.support_tickets FOR SELECT TO authenticated
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS "tickets_user_insert" ON public.support_tickets;
CREATE POLICY "tickets_user_insert" ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "tickets_admin_all" ON public.support_tickets;
CREATE POLICY "tickets_admin_all" ON public.support_tickets FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT admins.user_id FROM admins))
  WITH CHECK (auth.uid() IN (SELECT admins.user_id FROM admins));

-- support_messages
DROP POLICY IF EXISTS "messages_user_select" ON public.support_messages;
CREATE POLICY "messages_user_select" ON public.support_messages FOR SELECT TO authenticated
  USING (ticket_id IN (SELECT support_tickets.id FROM support_tickets WHERE (support_tickets.user_id = auth.uid())));
DROP POLICY IF EXISTS "messages_user_insert" ON public.support_messages;
CREATE POLICY "messages_user_insert" ON public.support_messages FOR INSERT TO authenticated
  WITH CHECK ((sender = 'user'::text) AND (author_id = auth.uid()) AND (ticket_id IN (SELECT support_tickets.id FROM support_tickets WHERE (support_tickets.user_id = auth.uid()))));
DROP POLICY IF EXISTS "messages_admin_all" ON public.support_messages;
CREATE POLICY "messages_admin_all" ON public.support_messages FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT admins.user_id FROM admins))
  WITH CHECK (auth.uid() IN (SELECT admins.user_id FROM admins));

-- support_faq
DROP POLICY IF EXISTS "faq_read_active" ON public.support_faq;
CREATE POLICY "faq_read_active" ON public.support_faq FOR SELECT TO authenticated
  USING (is_active);
DROP POLICY IF EXISTS "faq_admin_all" ON public.support_faq;
CREATE POLICY "faq_admin_all" ON public.support_faq FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT admins.user_id FROM admins))
  WITH CHECK (auth.uid() IN (SELECT admins.user_id FROM admins));

-- notifications  (nessuna policy INSERT: le notifiche nascono SOLO dai trigger
-- SECURITY DEFINER — un client non può fabbricarle. Comportamento voluto.)
DROP POLICY IF EXISTS "Users read own notifications" ON public.notifications;
CREATE POLICY "Users read own notifications" ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users delete own notifications" ON public.notifications;
CREATE POLICY "Users delete own notifications" ON public.notifications FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- activities
DROP POLICY IF EXISTS "Public reads public activities" ON public.activities;
CREATE POLICY "Public reads public activities" ON public.activities FOR SELECT TO anon, authenticated
  USING (visibility = 'public'::text);
DROP POLICY IF EXISTS "Followers see followers-only activities" ON public.activities;
CREATE POLICY "Followers see followers-only activities" ON public.activities FOR SELECT TO authenticated
  USING ((visibility = 'followers'::text) AND (EXISTS (SELECT 1 FROM follows WHERE ((follows.following_id = activities.user_id) AND (follows.follower_id = auth.uid())))));
DROP POLICY IF EXISTS "Users manage own activities" ON public.activities;
CREATE POLICY "Users manage own activities" ON public.activities FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- wallet_waitlist
DROP POLICY IF EXISTS "Anyone can insert" ON public.wallet_waitlist;
CREATE POLICY "Anyone can insert" ON public.wallet_waitlist FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access" ON public.wallet_waitlist;
CREATE POLICY "Service role full access" ON public.wallet_waitlist FOR ALL TO public USING (true) WITH CHECK (true);

-- ============================================================================
-- 7) STORAGE — bucket (le policy su storage.objects sono nelle migration datate:
--    venue-covers/avatars → 20260609_venue_covers_storage.sql
--    support-attachments  → 20260708_support.sql)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true),
       ('venue-covers', 'venue-covers', true),
       ('support-attachments', 'support-attachments', false)
ON CONFLICT (id) DO NOTHING;
