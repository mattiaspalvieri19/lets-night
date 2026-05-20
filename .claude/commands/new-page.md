Crea una nuova pagina web Next.js App Router per lets-night.

Argomento: $ARGUMENTS (es. "settings", "event/create")

Crea `apps/web/app/$ARGUMENTS/page.js` seguendo queste regole:
- `'use client'` se usa state/effects/eventi
- Import supabase da `../../lib/supabase` (aggiusta il path relativo)
- Import costanti/utility da `@lets-night/shared`
- Navbar `.lnav` coerente con le pagine esistenti
- Default export con nome PascalCase

Dopo la creazione mostra il path e suggerisci dove aggiungere il link di navigazione.
