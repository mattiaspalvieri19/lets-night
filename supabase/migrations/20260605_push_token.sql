-- Colonna per il token push Expo (salvato al login dall'app mobile)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS push_token text;
