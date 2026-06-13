# Let's Night

Piattaforma di scoperta e prenotazione di eventi notturni (Milano).
Monorepo: **sito web** (Next.js) + **app mobile** (Expo/React Native) con backend **Supabase** condiviso e pagamenti **Stripe**.

> Documentazione operativa completa (convenzioni, tabelle, regole di sviluppo) in **[`CLAUDE.md`](./CLAUDE.md)**.

---

## Stack

| Layer | Tecnologia |
|---|---|
| Monorepo | Turborepo + npm workspaces |
| Web | Next.js 16 (App Router) — `apps/web` |
| Mobile | Expo SDK 54 + Expo Router — `apps/mobile` |
| Codice condiviso | `packages/shared` (costanti, utility, design tokens) |
| Backend | Supabase (Postgres + Auth + RLS) |
| Pagamenti | Stripe Checkout |
| Linguaggio | JavaScript puro (no TypeScript) |
| Deploy web | Vercel (root: `apps/web`) |
| Deploy app | EAS Build |

## Struttura

```
lets-night/
├── apps/
│   ├── web/                 # Next.js (route in app/, API in app/api/)
│   └── mobile/              # Expo (route in app/, componenti in components/)
├── packages/
│   └── shared/              # @lets-night/shared — costanti + utility + design
└── supabase/
    └── migrations/          # schema del DB come codice (vedi sotto)
```

## Avvio rapido

**Prerequisiti:** Node ≥ 18, npm ≥ 10.

```bash
npm install                  # dalla root: installa tutti i workspace
```

Crea i due file di ambiente partendo dagli esempi (le chiavi si chiedono a Mattia):

```bash
cp apps/web/.env.local.example    apps/web/.env.local
cp apps/mobile/.env.local.example apps/mobile/.env.local
```

Avvio:

```bash
npm run dev          # web + mobile in parallelo
npm run dev:web      # solo web    → http://localhost:3000
npm run dev:mobile   # solo Expo   → Expo Go
npm run build:web    # build di produzione web
npm run lint         # lint del monorepo
```

> **Test pagamenti su telefono (Expo Go):** il telefono deve raggiungere il dev server web del Mac.
> L'URL dell'API viene ricavato in automatico dall'host di Expo (`apps/mobile/lib/apiUrl.js`),
> quindi basta che web e Metro girino sullo stesso Mac; avvia il web con host aperto:
> `npx next dev apps/web -H 0.0.0.0 -p 3000`. Carta di test Stripe: `4242 4242 4242 4242`.

## Database e migrazioni

Lo schema del database è versionato come codice in **`supabase/migrations/`** — un file `.sql`
per modifica, ordinato per data. **È la fonte di verità dello schema.**

Workflow attuale (manuale): ogni modifica = **un file nuovo** in quella cartella, da incollare
ed eseguire una volta nel **SQL Editor** di Supabase. Le migration sono idempotenti
(`IF EXISTS` / `CREATE OR REPLACE`), quindi rilanciarle è sicuro.
Non modificare un file già applicato: aggiungerne sempre uno nuovo.

> In prospettiva (staging/CI) conviene passare alla **CLI Supabase**
> (`supabase link` + `supabase db push`) che applica i file e ne tiene traccia automaticamente.

## Branch

- `main` → produzione
- `develop` → integrazione (PR sempre verso `develop`, mai diretti su `main`)
- `feature/*` → singole funzionalità

## Sicurezza

- I file `.env.local` **non** vanno mai committati (sono in `.gitignore`).
- Nel mobile, solo variabili `EXPO_PUBLIC_*` (chiavi pubbliche): mai segreti, finiscono nel bundle.
- La `SUPABASE_SERVICE_ROLE_KEY` e le chiavi `sk_` Stripe sono **solo lato server** (`apps/web`).
