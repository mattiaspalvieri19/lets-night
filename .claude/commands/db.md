Analizza l'utilizzo di Supabase nel codebase di lets-night.

Esegui queste operazioni:
1. Leggi `lib/supabase.js` — verifica la configurazione del client
2. Controlla `.env.local` — mostra solo i nomi delle variabili (NON i valori) e conferma se sono settate
3. Cerca tutte le query Supabase nel codebase con: `grep -rn "\.from('" app/ lib/`
4. Elenca tutte le tabelle referenziate nel codice
5. Cerca pattern problematici: query senza gestione dell'error, client duplicati

Riporta:
- Tabelle usate e in quali file
- Eventuali problemi trovati (query senza error handling, env vars mancanti)
- Suggerimenti per migliorare la sicurezza/robustezza delle query
