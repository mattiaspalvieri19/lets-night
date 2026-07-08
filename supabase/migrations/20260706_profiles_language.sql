-- ============================================================================
-- Let's Night — 2026-07-06 — MULTILINGUA
-- profiles.language: preferenza lingua dell'account (it/en/es/fr).
-- NULL = mai scelta → il client usa il default (italiano).
-- Nessuna policy nuova: il self-update dei profili esiste già.
-- Idempotente. Da applicare A MANO nel SQL editor.
-- ============================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS language text;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_language_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_language_check
  CHECK (language IS NULL OR language IN ('it', 'en', 'es', 'fr'));
