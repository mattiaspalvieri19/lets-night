-- ============================================================================
-- Let's Night — 2026-06-11 — hardening funzioni (advisor Supabase)
-- 1) update_event_booked_count aveva perso SET search_path nella migration
--    20260610 (advisor: function_search_path_mutable).
-- 2) Le funzioni trigger SECURITY DEFINER non devono essere eseguibili via
--    RPC da anon/authenticated (advisor 0028/0029). I trigger continuano a
--    funzionare: girano come owner della tabella, non serve EXECUTE ai client.
--    check_phone_available / check_username_available restano eseguibili
--    (sono RPC intenzionali usate dalla registrazione).
-- ============================================================================

ALTER FUNCTION public.update_event_booked_count() SET search_path = public;

-- La CREATE OR REPLACE della 20260610 aveva fatto perdere SECURITY DEFINER:
-- senza, il trigger gira coi permessi dell'utente e la RLS su events blocca
-- in silenzio l'aggiornamento di booked_count per le prenotazioni free client-side.
ALTER FUNCTION public.update_event_booked_count() SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION public.enforce_event_capacity()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_event_booked_count()     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_loyalty_on_booking()     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_activity_on_booking()    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_activity_on_favorite()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_activity_on_milestone()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()               FROM PUBLIC, anon, authenticated;
