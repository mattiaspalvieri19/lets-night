-- ============================================================================
-- Let's Night — 2026-07-08 — ASSISTENZA CLIENTI v1 (FAQ + ticket)
-- Sistema in-house, lato utente. Dati puri: client + RLS + 1 trigger, nessuna
-- API route (a differenza dei rimborsi che passano dal web per Stripe) →
-- l'assistenza funziona anche senza il server web acceso.
-- Idempotente. Da applicare A MANO nel SQL editor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TABELLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category           text NOT NULL CHECK (category IN ('booking','payment','account','event','bug','other')),
  subject            text NOT NULL,
  status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','waiting_user','resolved','closed')),
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
  sender          text NOT NULL CHECK (sender IN ('user','admin')),
  author_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  body            text NOT NULL,
  attachment_path text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_faq (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category   text NOT NULL,
  lang       text NOT NULL DEFAULT 'it' CHECK (lang IN ('it','en','es','fr')),
  question   text NOT NULL,
  answer     text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_tickets_user_id_idx  ON public.support_tickets(user_id);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx   ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS support_messages_ticket_idx  ON public.support_messages(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS support_faq_lookup_idx       ON public.support_faq(lang, category, is_active);

ALTER TABLE public.support_tickets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_faq      ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2) RLS — utente vede/gestisce i propri, admin vede tutto
-- ----------------------------------------------------------------------------
-- support_tickets
DROP POLICY IF EXISTS "tickets_user_select" ON public.support_tickets;
CREATE POLICY "tickets_user_select" ON public.support_tickets FOR SELECT TO authenticated
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS "tickets_user_insert" ON public.support_tickets;
CREATE POLICY "tickets_user_insert" ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "tickets_admin_all" ON public.support_tickets;
CREATE POLICY "tickets_admin_all" ON public.support_tickets FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM public.admins))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM public.admins));

-- support_messages
DROP POLICY IF EXISTS "messages_user_select" ON public.support_messages;
CREATE POLICY "messages_user_select" ON public.support_messages FOR SELECT TO authenticated
  USING (ticket_id IN (SELECT id FROM public.support_tickets WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "messages_user_insert" ON public.support_messages;
CREATE POLICY "messages_user_insert" ON public.support_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender = 'user'
    AND author_id = auth.uid()
    AND ticket_id IN (SELECT id FROM public.support_tickets WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS "messages_admin_all" ON public.support_messages;
CREATE POLICY "messages_admin_all" ON public.support_messages FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM public.admins))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM public.admins));

-- support_faq — lettura pubblica (solo attive), gestione admin
DROP POLICY IF EXISTS "faq_read_active" ON public.support_faq;
CREATE POLICY "faq_read_active" ON public.support_faq FOR SELECT TO authenticated
  USING (is_active);
DROP POLICY IF EXISTS "faq_admin_all" ON public.support_faq;
CREATE POLICY "faq_admin_all" ON public.support_faq FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM public.admins))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM public.admins));

-- ----------------------------------------------------------------------------
-- 3) notifications: nuovo type 'support' + colonna support_ticket_id
-- ----------------------------------------------------------------------------
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS support_ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE CASCADE;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('booking_confirmed','follow','friend_booking','reminder','generic','support'));

-- ----------------------------------------------------------------------------
-- 4) Trigger: risposta admin → notifica utente + stato "waiting_user"
--    (pattern notify_on_follow: SECURITY DEFINER + EXCEPTION WHEN OTHERS così
--    una notifica non blocca mai l'inserimento del messaggio)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_support_reply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ticket_owner uuid;
  ticket_subj  text;
BEGIN
  IF NEW.sender <> 'admin' THEN RETURN NEW; END IF;
  SELECT user_id, subject INTO ticket_owner, ticket_subj
  FROM support_tickets WHERE id = NEW.ticket_id;
  IF ticket_owner IS NULL THEN RETURN NEW; END IF;

  UPDATE support_tickets SET status = 'waiting_user', updated_at = now() WHERE id = NEW.ticket_id;

  INSERT INTO notifications (user_id, type, title, body, support_ticket_id)
  VALUES (
    ticket_owner, 'support', 'Risposta dall''assistenza',
    'Hai una risposta al tuo ticket: ' || coalesce(ticket_subj, ''),
    NEW.ticket_id
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_on_support_reply ON public.support_messages;
CREATE TRIGGER trg_notify_on_support_reply
  AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_support_reply();

-- Bumpa updated_at del ticket a ogni messaggio (anche dell'utente)
CREATE OR REPLACE FUNCTION public.touch_support_ticket()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE support_tickets SET updated_at = now() WHERE id = NEW.ticket_id;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_touch_support_ticket ON public.support_messages;
CREATE TRIGGER trg_touch_support_ticket
  AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_support_ticket();

REVOKE EXECUTE ON FUNCTION public.notify_on_support_reply() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_support_ticket()    FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5) Storage: bucket privato per gli screenshot dei ticket
--    Path: {user_id}/{ticket_id}/{file} — l'utente accede solo alla sua cartella
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('support-attachments', 'support-attachments', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "support_att_user_read" ON storage.objects;
CREATE POLICY "support_att_user_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'support-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "support_att_user_insert" ON storage.objects;
CREATE POLICY "support_att_user_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'support-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "support_att_admin_all" ON storage.objects;
CREATE POLICY "support_att_admin_all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'support-attachments' AND auth.uid() IN (SELECT user_id FROM public.admins))
  WITH CHECK (bucket_id = 'support-attachments' AND auth.uid() IN (SELECT user_id FROM public.admins));
