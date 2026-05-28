# Let's Night — CLAUDE.md

## Progetto
Piattaforma di scoperta e prenotazione eventi notturni per Milano e Roma.
"Il TripAdvisor del divertimento italiano."
Monorepo: sito web (Next.js) + app iOS/Android (Expo) con backend Supabase condiviso.

## Stack
| Layer | Tecnologia |
|---|---|
| Monorepo | Turborepo + npm workspaces |
| Web | Next.js 16.2 — App Router (`apps/web/app/`) |
| Mobile | Expo SDK 54 + Expo Router (`apps/mobile/app/`) |
| UI Web | CSS custom in `globals.css` + Tailwind CSS 4 |
| UI Mobile | NativeWind (Tailwind per React Native) |
| Backend | Supabase (DB PostgreSQL + Auth + RLS) |
| Payments | Stripe |
| Deploy Web | Vercel (root: `apps/web/`) |
| Deploy App | EAS Build (Expo Application Services) |
| Linguaggio | **JavaScript puro** — nessuna migrazione a TypeScript |

## Struttura monorepo

```
lets-night/
├── turbo.json
├── package.json              ← root workspace
├── apps/
│   ├── web/                  ← @lets-night/web (Next.js)
│   │   ├── app/              ← route Next.js App Router
│   │   ├── components/       ← componenti UI web
│   │   ├── lib/supabase.js   ← client Supabase per web
│   │   └── package.json
│   └── mobile/               ← @lets-night/mobile (Expo)
│       ├── app/              ← route Expo Router
│       │   ├── (tabs)/       ← navigazione tab principale
│       │   ├── event/[id].jsx
│       │   └── venue/[id].jsx
│       ├── components/       ← componenti UI mobile
│       ├── lib/supabase.js   ← client Supabase per React Native
│       └── package.json
└── packages/
    └── shared/               ← @lets-night/shared
        ├── constants.js      ← CATS, COLORS_BY_CAT, CITIES, BRAND_COLOR
        ├── utils.js          ← formatDate, formatDateFull, formatTime, getPriceLabel, isPastDate
        └── index.js
```

## Route web (`apps/web/app/`)
- `/` — Homepage con carousel eventi
- `/explore` — Lista eventi con filtri avanzati
- `/event/[id]` — Dettaglio evento
- `/venue/[id]` — Dettaglio locale
- `/login` + `/register` — Auth utenti
- `/dashboard` — Area personale utente
- `/auth/callback` + `/auth/confirm-sent` — Supabase auth flow
- `/business` + `/business/dashboard` + `/business/login` + `/business/register` — Portale locali
- `/admin` — Pannello admin

## Route mobile (`apps/mobile/app/`)
- `/(tabs)/index` — Home feed eventi
- `/(tabs)/explore` — Esplora con filtri
- `/(tabs)/profile` — Profilo utente
- `/event/[id]` — Dettaglio evento
- `/venue/[id]` — Dettaglio locale
- `/auth/login` — Login
- `/auth/register` — Registrazione

## packages/shared — cosa c'è e come importarlo

```js
import {
  // Costanti
  CATS,          // ['Tutti', 'Discoteca', ...]
  CATS_NO_TUTTI, // senza 'Tutti' (per explore)
  CITIES,        // ['Milano', 'Roma']
  COLORS_BY_CAT, // { 'Discoteca': ['#1a0533', '#0d0d1a', '#c084fc'], ... }
  BRAND_COLOR,   // '#12A0D7'
  // Utility
  formatDate,      // "Ven 15 Gen"
  formatDateFull,  // "Venerdi 15 Gennaio 2026"
  formatTime,      // "23:00"
  getPriceLabel,   // "EUR 15" oppure "Lista"
  isPastDate,      // boolean
} from '@lets-night/shared';
```

## Regole di sviluppo

### Generale
- JavaScript puro — no TypeScript, no JSDoc
- Nessun commento salvo per WHY non ovvi
- No `console.log` — solo `console.error` per errori Supabase

### Supabase
- Web: importa da `apps/web/lib/supabase.js`
- Mobile: importa da `apps/mobile/lib/supabase.js`
- Pattern standard:
  ```js
  const { data, error } = await supabase.from('table').select('...')
  if (error) console.error('Errore:', error)
  ```

### Variabili d'ambiente
- Web: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `apps/web/.env.local`
- Mobile: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `apps/mobile/.env.local`

### Nuovi componenti
- Web: `apps/web/components/NomeComponente.js`
- Mobile: `apps/mobile/components/NomeComponente.jsx`
- `'use client'` solo su web se il componente usa hooks

### Nuove pagine
- Web: `apps/web/app/[route]/page.js`
- Mobile: `apps/mobile/app/[route].jsx` oppure `apps/mobile/app/[route]/index.jsx`

## Tabelle Supabase
- `events` — id, title, category, event_date, event_time, price, is_active, is_sponsored, source, venue_id
- `venues` — id, name, zona, city, owner_id, is_partner, is_verified
- `profiles` — id, role (user/business/admin), full_name, phone, city
- `bookings` — id, user_id, event_id, status, created_at
- `wallet_waitlist` — email, city, source

## Branch strategy
- `main` → produzione
- `develop` → integrazione
- `feature/*` → nuove funzionalità
- PR sempre verso `develop`, mai direttamente su `main`

## Comandi Turborepo
```bash
npm run dev          # avvia web + mobile in parallelo
npm run dev:web      # solo sito web → http://localhost:3000
npm run dev:mobile   # solo app Expo → Expo Go
npm run build:web    # build Next.js
npm run lint         # lint tutto il monorepo
```

## Setup iniziale (nuovo sviluppatore)

Passi da eseguire su un nuovo Mac prima di iniziare a lavorare.

### 1. Prerequisiti
```bash
node -v   # deve essere >= 18
npm -v    # deve essere >= 10
```

### 2. Clone e dipendenze
```bash
git clone https://github.com/mattiaspalvieri19/lets-night.git
cd lets-night
npm install
```

### 3. Variabili d'ambiente
Creare i due file (chiedere le chiavi a Mattia):
```
apps/web/.env.local
  NEXT_PUBLIC_SUPABASE_URL=...
  NEXT_PUBLIC_SUPABASE_ANON_KEY=...
  SUPABASE_SERVICE_ROLE_KEY=...     ← solo server, NON in mobile
  STRIPE_SECRET_KEY=...
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=...

apps/mobile/.env.local
  EXPO_PUBLIC_SUPABASE_URL=...
  EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

### 4. Claude Code + MCP servers
```bash
# Installa Claude Code
npm install -g @anthropic-ai/claude-code

# Context7 (documentazione live — nessun token)
claude mcp add -s user context7 -- npx -y @upstash/context7-mcp@latest

# Supabase MCP — token da supabase.com/dashboard/account/tokens
claude mcp add -s user supabase \
  -e SUPABASE_ACCESS_TOKEN=<TOKEN> \
  -- npx -y @supabase/mcp-server-supabase@latest \
  --project-ref bfnqkpyouqszpvxisajr --read-only

# GitHub MCP — token da github.com/settings/tokens (scopes: repo, read:org)
claude mcp add -s user github \
  -e GITHUB_TOKEN=<TOKEN> \
  -- npx -y @modelcontextprotocol/server-github
```

Riavviare Claude Code dopo aver aggiunto i server.

---

## Team AI — workflow

### Modalità operative

| Modalità | Quando | Come si attiva |
|---|---|---|
| **Plan** | Feature con >3 file coinvolti | Di' "progetta [feature]" |
| **Build** | Implementazione | Di' "implementa [feature]" → worktree isolato |
| **Review** | Prima di ogni merge su develop | `/ultrareview` (Claude lo suggerisce) |
| **Debug** | Qualcosa è rotto | Di' "debug [problema]" → agente Explore + fix |

### Flusso per ogni feature

```
PLAN → BUILD (worktree isolato) → REVIEW (/ultrareview) → MERGE su develop
```

### Regole
- Nessun `git push --force` o `git reset --hard`
- Il Reviewer segnala, non corregge — la correzione avviene in una nuova sessione
- Il Supabase MCP è in read-only: le migration si scrivono a mano su Supabase dashboard
- CLAUDE.md è la fonte di verità condivisa tra tutti gli agenti e collaboratori

### MCP Servers

| Server | Uso |
|---|---|
| **Context7** | Docs aggiornate di Expo, Next.js, Supabase, React Native |
| **Supabase** | Ispeziona schema, RLS policies, esegue SELECT diretti |
| **GitHub** | Crea PR, legge issues, code review |

Attivare Context7 in una query aggiungendo `use context7` nel messaggio.

---

## Slash commands disponibili
| Comando | Cosa fa |
|---|---|
| `/dev` | Avvia dev server web |
| `/dev:mobile` | Avvia Expo |
| `/build` | Build web produzione |
| `/lint` | ESLint web |
| `/new-page [nome]` | Scaffolda pagina web |
| `/new-screen [nome]` | Scaffolda schermata mobile |
| `/new-component [nome]` | Scaffolda componente |
| `/db` | Analizza query Supabase |
| `/status` | Git status |
| `/deploy` | Checklist pre-deploy |
