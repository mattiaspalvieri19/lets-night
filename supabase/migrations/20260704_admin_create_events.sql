-- ============================================================================
-- Let's Night — 2026-07-04 — follow-up area admin
-- (a) L'admin può CREARE eventi a nome dei locali (l'INSERT era volutamente
--     assente nel 20260702; ora richiesto dalla gestione admin).
-- (b) admin_list_admin_ids(): con il self-read del 20260702 il client non può
--     enumerare gli admin, ma la sezione Utenti deve escluderli dalla lista.
--     SECURITY DEFINER: restituisce il set completo SOLO se il chiamante è
--     admin, set vuoto per chiunque altro.
-- Idempotente. Da applicare A MANO nel SQL editor.
-- ============================================================================

DROP POLICY IF EXISTS "Admins can insert events" ON public.events;
CREATE POLICY "Admins can insert events"
  ON public.events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IN (SELECT user_id FROM public.admins));

CREATE OR REPLACE FUNCTION public.admin_list_admin_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT a.user_id FROM public.admins a
  WHERE EXISTS (SELECT 1 FROM public.admins x WHERE x.user_id = auth.uid());
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_admin_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_admin_ids() TO authenticated;
