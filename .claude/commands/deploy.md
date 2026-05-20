Esegui la checklist pre-deploy completa per lets-night.

Controlla ogni punto e marca ✓ o ✗:

1. **Build** — Esegui `npm run build`. Deve completare senza errori.
2. **Lint** — Esegui `npm run lint`. Nessun errore consentito.
3. **Variabili d'ambiente** — Verifica che `.env.local` esista e contenga:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - (opzionale) `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PK`
4. **Git clean** — `git status` deve mostrare working tree pulito.
5. **Branch corretto** — Conferma di essere su `develop` o `main`.
6. **No secrets nel codice** — Cerca con `grep -rn "sk_live\|sk_test\|eyJ" app/ lib/`. Nessun risultato atteso.
7. **Console.log** — Cerca `grep -rn "console\.log" app/ components/`. Rimuovi quelli di debug.

Alla fine mostra un report compatto con tutti i check e, se tutto è ✓, conferma che il progetto è pronto per il deploy su Vercel.
