# 🔐 Let's Night — Checklist chiavi & token

> ⚠️ Questo file **non contiene nessun valore segreto** — solo nomi, posizioni e
> istruzioni su come rigenerare/ruotare le chiavi. I valori veri stanno SOLO in
> Vercel, in `.env.local` (gitignorato) e nella config dei server MCP.

## Legenda
- 🔑 **Badge sviluppatore** → *scade*, va rigenerato ogni tanto. Roba di gestione: se scade si ferma **solo** lo strumento (Claude Code / MCP), **non** l'app. Nessun utente ne risente.
- ⚙️ **Chiave motore** → *non scade a orologio*. Fa girare l'app 24/7. Si cambia ("ruota") solo se compromessa o di proposito.

---

## 🔑 BADGE che SCADONO — da ricordare

Gli unici due che richiedono attenzione periodica.

### 1. Token GitHub
- **A cosa serve:** far leggere a Claude Code il repository (PR, codice) via MCP.
- **Dove sta:** config del server MCP (comando `claude mcp add github …`), a livello utente. NON nel repo.
- **Scade?** Sì, alla data impostata alla creazione.
- **Se scade:** si ferma solo il MCP GitHub di Claude Code. Nessun utente coinvolto.
- **Come rigenerarlo:**
  1. github.com → **Settings → Developer settings → Personal access tokens**
  2. Genera nuovo token con permessi **`repo`** + **`read:org`**
  3. Rincollalo nel comando MCP:
     ```
     claude mcp add -s user github \
       -e GITHUB_TOKEN=<NUOVO> \
       -- npx -y @modelcontextprotocol/server-github
     ```
  4. Riavvia Claude Code.

### 2. Token Supabase (accesso gestione)
- **A cosa serve:** far ispezionare a Claude Code lo schema/RLS del DB (sola lettura) via MCP.
- **Dove sta:** config del server MCP (comando `claude mcp add supabase …`), a livello utente.
- **Scade?** Sì. ⚠️ **Attualmente scaduto/rotto — da rigenerare.**
- **Se scade:** si ferma solo l'ispezione DB via MCP. L'app gira comunque (verificato: durante l'audit il token era scaduto e l'app funzionava).
- **Come rigenerarlo:**
  1. **supabase.com/dashboard/account/tokens** → Generate new token
  2. Rincollalo nel comando MCP:
     ```
     claude mcp add -s user supabase \
       -e SUPABASE_ACCESS_TOKEN=<NUOVO> \
       -- npx -y @supabase/mcp-server-supabase@latest \
       --project-ref bfnqkpyouqszpvxisajr --read-only
     ```
  3. Riavvia Claude Code.

> 📅 **Promemoria:** evento ricorrente in calendario ogni ~80 giorni → "Rigenerare token GitHub + Supabase MCP".

---

## ⚙️ CHIAVI MOTORE — NON scadono a orologio

Fanno funzionare l'app. Si cambiano solo se compromesse o di proposito.

| Chiave | Variabile | Dove vive | Lato | Come si cambia |
|---|---|---|---|---|
| Supabase `anon` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Vercel + app mobile | Pubblica (client) | Supabase → Settings → API → aggiorna in Vercel **e rifai il build mobile** |
| Supabase `service_role` | `SUPABASE_SERVICE_ROLE_KEY` | **Solo Vercel (server)** — MAI nel mobile | Segreta | Supabase → Settings → API → aggiorna in Vercel |
| Stripe segreta | `STRIPE_SECRET_KEY` (`sk_live_…`) | Solo Vercel (server) | Segreta | Stripe → Developers → API keys → **Roll key** → aggiorna in Vercel |
| Stripe pubblicabile | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` / `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`pk_live_…`) | Vercel + app mobile | Pubblica | come sopra, aggiorna valore (+ rebuild mobile) |
| Stripe webhook | `STRIPE_WEBHOOK_SECRET` (`whsec_…`) | Solo Vercel (server) | Segreta | Stripe → Developers → Webhooks → endpoint → reveal signing secret |
| Resend (email) | `RESEND_API_KEY` (`re_…`) | Solo Vercel (server) | Segreta | Resend → API Keys → crea nuova → aggiorna in Vercel |

⚠️ **Mobile:** le chiavi `EXPO_PUBLIC_…` sono "cotte dentro" l'app al build. Se ne cambi una, **serve rifare il build EAS e ripubblicare** (gli utenti devono aggiornare). Su Vercel invece basta cambiare il valore e ridistribuire — istantaneo.

---

## 🟡 Non è una chiave, ma sta qui vicino
- **`EXPO_PUBLIC_API_URL`** — non è un segreto: è il "numero di telefono" del sito che l'app mobile chiama per pagamenti/scanner/rimborsi. **Va impostato = dominio Vercel** nel build di produzione, altrimenti l'app in prod chiama `localhost` e quei flussi si rompono. (Criticità H4.)

---

## 📏 Regole d'oro
1. **Mai** scrivere una chiave nel codice o committarla su GitHub. Solo Vercel / `.env.local` (gitignorato) / config MCP.
2. `service_role` e le chiavi `sk_` / `whsec_` / `re_` stanno **solo lato server (Vercel)**, **mai** nell'app mobile.
3. Se sospetti una fuga → ruota subito quella chiave e aggiornala dove vive (Vercel + eventuale rebuild mobile).
4. I due badge (GitHub, Supabase) si rigenerano con calma quando scadono: nessun cliente ne risente.

---

## ✅ Azione aperta
- Rigenerare il **token Supabase MCP** (§2): è scaduto.
