-- ============================================================================
-- Let's Night — 2026-07-06 — profilo admin fuori dalla ricerca pubblica
-- L'account admin (Dashboard → Add User) riceve dal trigger handle_new_user un
-- profilo role='user' SENZA nome → compariva nella ricerca dell'app come
-- fallback "Utente"/"User". Fix dato: nome pulito + searchable=false
-- (il filtro privacy esiste già in app e web — zero codice).
-- Vale per l'admin attuale e per ogni futuro admin già presente in admins.
-- Idempotente. Da applicare A MANO nel SQL editor.
-- ============================================================================

UPDATE public.profiles
SET full_name = COALESCE(NULLIF(full_name, ''), 'Let''s Night'),
    privacy_settings = COALESCE(privacy_settings, '{}'::jsonb) || '{"searchable": false}'::jsonb
WHERE id IN (SELECT user_id FROM public.admins);
