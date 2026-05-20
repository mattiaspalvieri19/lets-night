Mostra lo stato attuale del repository lets-night.

Esegui in sequenza:
1. `git status` — stato del working tree
2. `git log --oneline -10` — ultimi 10 commit
3. `git branch` — tutti i branch locali con quello corrente
4. `git diff --stat HEAD` — file modificati dall'ultimo commit

Riporta un riassunto:
- Branch attuale e a che punto è rispetto a develop/main
- Cosa è in progress (file modificati non committati)
- Cosa è pronto per il commit
- Eventuali file non tracciati rilevanti (escludi node_modules, .next)
