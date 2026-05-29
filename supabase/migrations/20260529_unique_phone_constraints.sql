-- Vincoli di unicita sui numeri di telefono.
-- Un numero di telefono non puo essere associato a piu di un locale,
-- ne a piu di un utente. NULL ammessi (constraint parziale).

-- Prima rimuoviamo eventuali duplicati esistenti se presenti
-- (non in questa migration: si verifica manualmente se serve)

CREATE UNIQUE INDEX IF NOT EXISTS venues_phone_unique
  ON public.venues (phone)
  WHERE phone IS NOT NULL AND phone <> '';

CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique
  ON public.profiles (phone)
  WHERE phone IS NOT NULL AND phone <> '';
