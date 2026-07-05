-- ============================================================================
-- Let's Night — 2026-07-02 — AREA PLATFORM ADMIN
-- (f) account admin dedicato: rimozione del vecchio seed (account user) e
--     inserimento del nuovo account creato da Dashboard → Add User.
-- (a) admins: SELECT solo self-read (prima chiunque autenticato enumerava gli
--     admin). Le subquery RLS "auth.uid() IN (SELECT user_id FROM admins)"
--     continuano a funzionare: a ogni utente basta vedere la PROPRIA riga.
-- (b) event_table_types: gestione completa per admin (oggi solo venue owner).
-- (c) event_tables: UPDATE/DELETE admin (la SELECT admin esiste già, 20260612).
-- (d) storage venue-covers: scrittura admin (policy owner intatte; path cover
--     evento: <venue_id>/event-<event_id>.<ext> — convenzione mobile esistente).
-- (e) tavolo combinato: colonna combined_from + 2 RPC atomiche SECURITY
--     DEFINER con check admin interno. Si combinano TIPOLOGIE, mai istanze.
-- Idempotente (eccetto (f), che richiede la sostituzione del placeholder).
-- ============================================================================

-- (f) SWAP ACCOUNT ADMIN — ⚠️ COMPILARE IL PLACEHOLDER PRIMA DI ESEGUIRE.
-- Prerequisito: creare l'utente admin da Dashboard → Authentication → Add User
-- (email dedicata, password forte, "Auto Confirm User" attivo) e copiare l'UUID.
-- L'account user personale (eb62a411-...) smette di essere admin.
INSERT INTO public.admins (user_id)
VALUES ('<UUID_NUOVO_ACCOUNT_ADMIN>')  -- ← SOSTITUIRE prima di eseguire
ON CONFLICT DO NOTHING;
DELETE FROM public.admins
WHERE user_id = 'eb62a411-f709-4990-9a09-52f7846ac18f';

-- (a) admins self-read
DROP POLICY IF EXISTS "Authenticated users can read admins" ON public.admins;
DROP POLICY IF EXISTS "Users can read own admin row" ON public.admins;
CREATE POLICY "Users can read own admin row"
  ON public.admins FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- (b) tipologie tavolo: admin ALL
DROP POLICY IF EXISTS "Admins manage table types" ON public.event_table_types;
CREATE POLICY "Admins manage table types"
  ON public.event_table_types FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM public.admins))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM public.admins));

-- (c) istanze tavolo: admin UPDATE/DELETE
DROP POLICY IF EXISTS "Admins can update event tables" ON public.event_tables;
CREATE POLICY "Admins can update event tables"
  ON public.event_tables FOR UPDATE TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM public.admins))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM public.admins));
DROP POLICY IF EXISTS "Admins can delete event tables" ON public.event_tables;
CREATE POLICY "Admins can delete event tables"
  ON public.event_tables FOR DELETE TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM public.admins));

-- (d) storage: admin può scrivere su venue-covers
DROP POLICY IF EXISTS "venue_covers_admin_insert" ON storage.objects;
CREATE POLICY "venue_covers_admin_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'venue-covers' AND auth.uid() IN (SELECT user_id FROM public.admins));
DROP POLICY IF EXISTS "venue_covers_admin_update" ON storage.objects;
CREATE POLICY "venue_covers_admin_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'venue-covers' AND auth.uid() IN (SELECT user_id FROM public.admins));
DROP POLICY IF EXISTS "venue_covers_admin_delete" ON storage.objects;
CREATE POLICY "venue_covers_admin_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'venue-covers' AND auth.uid() IN (SELECT user_id FROM public.admins));

-- (e) tavolo combinato
ALTER TABLE public.event_table_types ADD COLUMN IF NOT EXISTS combined_from uuid[];

-- Combina 2+ tipologie in una nuova (prezzo=somma, posti=somma cap 30 per il
-- CHECK max_people 1..30, disponibilità=N scelta) scalando N dalle sorgenti.
-- Lock FOR UPDATE in ordine di id (anti-deadlock); "libero" = tables_count −
-- istanze non cancelled (stesso conteggio di enforce_table_availability).
CREATE OR REPLACE FUNCTION public.admin_combine_table_types(
  p_event_id uuid,
  p_source_type_ids uuid[],
  p_tables_count int,
  p_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  src record;
  distinct_ids uuid[];
  found int := 0;
  free_count int;
  sum_price numeric := 0;
  sum_people int := 0;
  names text := '';
  new_id uuid;
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

  FOR src IN
    SELECT * FROM public.event_table_types
    WHERE id = ANY(distinct_ids)
    ORDER BY id
    FOR UPDATE
  LOOP
    found := found + 1;
    IF src.event_id IS DISTINCT FROM p_event_id THEN
      RAISE EXCEPTION 'TYPE_NOT_IN_EVENT' USING ERRCODE = 'check_violation';
    END IF;
    IF src.combined_from IS NOT NULL THEN
      RAISE EXCEPTION 'CANNOT_COMBINE_COMBINED' USING ERRCODE = 'check_violation';
    END IF;
    SELECT src.tables_count - count(*) INTO free_count
    FROM public.event_tables
    WHERE type_id = src.id AND status <> 'cancelled';
    IF free_count < p_tables_count THEN
      RAISE EXCEPTION 'INSUFFICIENT_FREE_TABLES' USING ERRCODE = 'check_violation';
    END IF;
    sum_price := sum_price + src.total_price;
    sum_people := sum_people + src.max_people;
    names := names || CASE WHEN names = '' THEN '' ELSE ' + ' END || src.name;
  END LOOP;

  IF found <> array_length(distinct_ids, 1) THEN
    RAISE EXCEPTION 'TYPE_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.event_table_types
  SET tables_count = tables_count - p_tables_count
  WHERE id = ANY(distinct_ids);

  INSERT INTO public.event_table_types
    (event_id, name, total_price, max_people, includes, tables_count, combined_from)
  VALUES (
    p_event_id,
    COALESCE(NULLIF(trim(p_name), ''), 'Combinato: ' || names),
    sum_price,
    LEAST(sum_people, 30),
    'Tavolo combinato (' || names || ')',
    p_tables_count,
    distinct_ids
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_combine_table_types(uuid, uuid[], int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_combine_table_types(uuid, uuid[], int, text) TO authenticated;

-- Scioglie un combinato: il FK NO ACTION di event_tables.type_id bloccherebbe
-- comunque il DELETE se esistono istanze (anche cancelled) → check esplicito
-- con errore leggibile; i conteggi tornano alle sorgenti superstiti (una
-- sorgente eliminata nel frattempo perde il suo conteggio: accettato).
CREATE OR REPLACE FUNCTION public.admin_dissolve_combined_type(p_type_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t record;
  inst_count int;
  src_id uuid;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() NOT IN (SELECT user_id FROM public.admins) THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO t FROM public.event_table_types WHERE id = p_type_id FOR UPDATE;
  IF t IS NULL THEN
    RAISE EXCEPTION 'TYPE_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;
  IF t.combined_from IS NULL THEN
    RAISE EXCEPTION 'NOT_A_COMBINED_TYPE' USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO inst_count FROM public.event_tables WHERE type_id = p_type_id;
  IF inst_count > 0 THEN
    RAISE EXCEPTION 'TYPE_HAS_TABLES' USING ERRCODE = 'check_violation';
  END IF;

  FOR src_id IN SELECT unnest(t.combined_from) ORDER BY 1
  LOOP
    UPDATE public.event_table_types
    SET tables_count = tables_count + t.tables_count
    WHERE id = src_id;
  END LOOP;

  DELETE FROM public.event_table_types WHERE id = p_type_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_dissolve_combined_type(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dissolve_combined_type(uuid) TO authenticated;
