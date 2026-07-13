-- ============================================================================
-- Let's Night — 2026-07-13 — REGISTRO (audit_logs) — fix M3, v1
-- ============================================================================
-- La "scatola nera" del progetto: memoria permanente dei fatti SOLDI + FRODE.
-- Oggi le anomalie ([PAYMENT_ANOMALY], [REFUND_FAILED], …) muoiono nei log
-- Vercel che si autodistruggono in poche ore; le azioni client-side (annullo
-- utente, check-in manuale del locale) non lasciano traccia da nessuna parte.
--
-- PRINCIPI:
--  • INDELEBILE — nessuna policy INSERT/UPDATE/DELETE: scrivono SOLO il server
--    (service_role) e i trigger SECURITY DEFINER; nessuno (nemmeno l'admin via
--    app) può riscrivere o cancellare la storia. Lettura: solo admin.
--  • SOPRAVVIVE — le colonne booking_id/event_id/… sono uuid SENZA foreign key:
--    se la riga originale viene eliminata (es. cancellazione account → cascade
--    sulle bookings), la memoria del movimento resta.
--  • MAI ROMPE I FLUSSI — i trigger inghiottono ogni errore (EXCEPTION →
--    RETURN): il diario non deve mai far fallire una prenotazione o un rimborso.
--
-- Cosa scrive QUI il database (trigger): ciclo di vita prenotazioni — incluse
-- le strade che NON passano dal server (prenotazioni gratuite, annullo utente,
-- check-in manuale del locale) — e cambi prezzo eventi.
-- Il resto (pagamenti/rimborsi/scanner/chargeback) lo scrive il server web via
-- lib/auditLog.js negli stessi commit.
--
-- Retention: nessuna cancellazione automatica in v1 (volume minuscolo); la
-- policy di retention + export su cloud esterno arrivano col blocco H2 e vanno
-- dichiarate nell'informativa privacy (vedi decisioni 2026-07-13).
-- Idempotente. Da applicare A MANO nel SQL editor.
-- ============================================================================

-- ── 1. Tabella ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type       text NOT NULL,
  severity   text NOT NULL DEFAULT 'info'
               CHECK (severity IN ('info', 'warn', 'error')),
  actor_id   uuid,   -- chi ha agito (auth.uid(); NULL se server/service_role)
  user_id    uuid,   -- utente coinvolto
  booking_id uuid,   -- nessuna FK, di proposito: il log sopravvive alle cancellazioni
  event_id   uuid,
  venue_id   uuid,
  message    text,   -- riga leggibile per l'admin
  details    jsonb,  -- contesto completo (importi, session Stripe, motivi, …)
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_created_idx  ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_type_idx     ON public.audit_logs (type);
CREATE INDEX IF NOT EXISTS audit_logs_booking_idx  ON public.audit_logs (booking_id) WHERE booking_id IS NOT NULL;
-- L'admin di default guarda i problemi: indice parziale su warn/error.
CREATE INDEX IF NOT EXISTS audit_logs_severity_idx ON public.audit_logs (created_at DESC) WHERE severity <> 'info';

-- ── 2. RLS: lettura solo admin, scrittura solo server/trigger ───────────────
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_admin_select" ON public.audit_logs;
CREATE POLICY "audit_admin_select" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM public.admins));

-- Nessuna policy di scrittura + REVOKE esplicito: doppio lucchetto.
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM anon, authenticated;

-- ── 3. Trigger: ciclo di vita prenotazioni ──────────────────────────────────
-- Cattura TUTTE le strade, incluse quelle client-side che il server non vede:
-- prenotazione gratuita (INSERT dall'app), annullo utente, check-in manuale.
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
  v_actor := auth.uid();  -- NULL quando agisce il server (service_role)

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
        'stripe_session_id', NEW.stripe_session_id,
        'paid', NEW.stripe_session_id IS NOT NULL
      )
    );

  ELSIF TG_OP = 'UPDATE' THEN
    -- Cambio di stato (annullo, nega, riattiva…)
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
    -- QR azzerato SENZA cambio stato (caso raro: invalidazione pura)
    ELSIF OLD.qr_code IS NOT NULL AND NEW.qr_code IS NULL THEN
      INSERT INTO public.audit_logs (type, severity, actor_id, user_id, booking_id, event_id, message, details)
      VALUES (
        'qr_invalidated', 'warn', v_actor, NEW.user_id, NEW.id, NEW.event_id,
        'QR invalidato (stato invariato: ' || COALESCE(NEW.status, '?') || ')',
        jsonb_build_object('status', NEW.status)
      );
    END IF;

    -- Check-in messo / tolto (anche manuale dal locale, che è client-side)
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
    -- La memoria finanziaria sopravvive anche all'eliminazione fisica
    -- (es. cancellazione account utente → cascade sulle sue prenotazioni).
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
        'stripe_session_id', OLD.stripe_session_id
      )
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  -- Il diario non deve MAI rompere il flusso che lo genera.
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_booking_changes ON public.bookings;
CREATE TRIGGER trg_audit_booking_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.audit_booking_changes();

-- ── 4. Trigger: cambio prezzo evento ────────────────────────────────────────
-- Spiega a posteriori le anomalie "prezzo cambiato dopo il pagamento" e le
-- contestazioni "quando ho prenotato costava meno".
CREATE OR REPLACE FUNCTION public.audit_event_price_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.price IS DISTINCT FROM OLD.price
     OR NEW.table_price IS DISTINCT FROM OLD.table_price THEN
    INSERT INTO public.audit_logs (type, severity, actor_id, event_id, venue_id, message, details)
    VALUES (
      'event_price_changed', 'info', auth.uid(), NEW.id, NEW.venue_id,
      'Prezzo evento modificato: "' || COALESCE(NEW.title, '?') || '"',
      jsonb_build_object(
        'price_from', OLD.price, 'price_to', NEW.price,
        'table_price_from', OLD.table_price, 'table_price_to', NEW.table_price
      )
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_event_price_change ON public.events;
CREATE TRIGGER trg_audit_event_price_change
  AFTER UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.audit_event_price_change();

-- ── 5. Igiene: le funzioni-trigger non sono invocabili dai client ───────────
REVOKE EXECUTE ON FUNCTION public.audit_booking_changes()    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_event_price_change() FROM PUBLIC, anon, authenticated;
