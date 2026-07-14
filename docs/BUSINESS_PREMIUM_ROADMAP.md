# Piani Business: Base & Premium — Roadmap

> Documento di prodotto/tecnico. Il **Piano Base è implementato** (tipologie di
> ingresso, sezione Eventi = configurazione, sezione Prenotazioni = operatività).
> Tutto ciò che segue è **FUTURO**: niente in questo documento è costruito, e
> niente va costruito senza una decisione esplicita.
> Creato: 2026-07-14 · collegato a `docs/STRIPE_CONNECT_PLAN.md`.

---

## Il modello a due piani (visione)

| | **Base** (oggi, implicito) | **Premium** (futuro) |
|---|---|---|
| Costo per il locale | Gratuito | Subscription mensile/annuale (prezzo da definire) |
| Fee sulle prenotazioni via app | ~**10%** (indicativa, non definitiva) | ~**9%** (indicativa, non definitiva) |
| Gestione eventi + tipologie ingresso/tavolo | ✅ | ✅ |
| Prenotazioni: nominativi, ricerca, check-in, tavoli | ✅ (solo prenotazioni via app) | ✅ |
| Prenotazioni esterne manuali | ❌ | ✅ |
| Importazione AI da file/foto | ❌ | ✅ (con token) |
| Gestionale unificato app+esterne | ❌ | ✅ |

**Nota architetturale**: oggi non esiste ALCUN campo "piano" nel DB. Quando si
partirà: tabella `plans` (o config centralizzata) + colonna `venues.plan`
(default `'base'`) + stato abbonamento. **MAI hardcodare 10%/9% nei componenti**:
le percentuali vivranno in una configurazione centralizzata (tabella `plans` o
costanti server-side in `packages/shared`), lette da checkout/fulfillment.

---

## 1. Abbonamento Premium

- Subscription **mensile o annuale** via **Stripe Billing** (Checkout mode
  `subscription` + webhook `customer.subscription.*`). Prezzo da definire.
- Stato abbonamento su `venues` (o tabella `venue_subscriptions`):
  `plan`, `subscription_status` (active/past_due/canceled), `current_period_end`,
  `stripe_customer_id`, `stripe_subscription_id`.
- **Upgrade/downgrade**: cambio piano da dashboard business; Stripe prorata.
- **Trial**: opzionale, da decidere (Stripe lo supporta nativamente, `trial_period_days`).
- **Pagamento fallito**: grace period (Stripe Smart Retries) → se decade:
  downgrade automatico a Base (fee Base, feature Premium bloccate in sola
  lettura — MAI cancellare i dati inseriti col Premium).
- Fattura della subscription: Stripe Invoicing.
- Dipendenza: conviene attivarlo INSIEME a Stripe Connect (stesso cantiere
  "pagamenti go-live", vedi `STRIPE_CONNECT_PLAN.md`).

## 2. Fee differenziate (10% / 9%)

- Percentuali **indicative e non definitive**; oggi il modello fee utente è la
  booking fee fissa (`BOOKING_FEE` 1,50 € in `packages/shared/constants.js`) e
  il ricavo piattaforma % NON esiste ancora (arriva con Connect,
  `application_fee_amount` — vedi piano Connect §4).
- Implementazione futura: `plans` table → `{ plan: 'base', app_fee_pct: 10 }`,
  `{ plan: 'premium', app_fee_pct: 9 }` → checkout-session/fulfillment leggono
  la % dal piano del venue al momento del pagamento. Snapshot della % sulla
  prenotazione (audit/contestazioni).
- Cambi di piano NON retroattivi: la fee si cristallizza alla vendita.

## 3. Prenotazioni esterne manuali (Premium)

Il locale inserisce a mano prenotazioni prese FUORI dall'app (telefono, PR,
terze parti): ingressi e tavoli, con nominativi, importi, stato pagamento,
persona/PR che ha incassato, note interne.

- **Campo `bookings.source`** (da aggiungere SOLO quando si costruisce):
  `'app' | 'manual' | 'ai_import' | 'third_party'` — default `'app'`,
  retro-compatibile (tutte le esistenti = app). Migration piccola:
  `ALTER TABLE bookings ADD COLUMN source text NOT NULL DEFAULT 'app' CHECK (...)`.
- Le esterne NON hanno QR/pagamento Stripe: `stripe_session_id NULL`,
  `qr_code NULL`, campi extra (`external_payment_status`, `received_by`, `notes`)
  o tabella satellite `booking_external_details`.
- ⚠️ I trigger attuali (guard C1, capienza, booked_count, loyalty, notifiche)
  andranno rivisti per il caso `source='manual'`: inserite dal VENUE (non
  dall'utente), niente user_id reale → probabilmente user_id nullable o un
  "profilo ospite" — decisione di design da prendere allora.
- UI: tab Prenotazioni → bottone "+ Aggiungi esterna" (solo Premium), badge
  visivo "Esterna" sulle righe, filtro per source.

## 4. Importazione AI da file/immagine (Premium)

Il locale carica **immagine / PDF / Word / Pages** (liste porta, fogli PR) e
l'AI estrae le prenotazioni.

- Pipeline: upload (bucket privato) → parsing AI (Claude con visione) →
  estrazione strutturata: ingresso vs tavolo, nomi/cognomi, gruppi/tavoli,
  importi, stato pagamento, a chi è stato pagato → **schermata di CONFERMA
  UMANA** (obbligatoria: l'AI propone, il locale valida riga per riga) →
  insert con `source='ai_import'`.
- Distinguere sempre le importate dalle native app (badge + filtro).
- Gestione errori: righe dubbie evidenziate, mai salvataggio silenzioso.
- Costi: ogni import consuma **token** (vedi §5).

## 5. Token AI e upselling

- Il Premium include un monte **token/crediti AI** mensile (quantità da definire).
- Esauriti i token → acquisto pacchetti aggiuntivi (Stripe one-off).
- Contatore token su venue + log consumi (tabella `ai_usage`).
- **Non implementare ora**; il pricing dei token dipende dai costi API reali.

## 6. Check-in per prenotazioni esterne

- Via app: **QR** (scanner) o manuale — come oggi.
- Esterne/manuali/AI: **solo check-in manuale** dalla tab Prenotazioni
  (nessun QR emesso). La source distingue i due flussi anche allo scanner
  (un QR non può esistere per una esterna).

## 7. Gestionale Premium (visione)

Un'unica vista operativa della serata:
- ingressi + tavoli, app + esterne, in un'unica lista con ricerca;
- pagamento residuo tavoli (già nel Base) esteso alle esterne;
- note interne per prenotazione;
- statistiche avanzate (per PR, per tipologia, per source);
- in futuro: suggerimenti AI (pricing, riempimento, alert anomalie);
- possibile piantina/mappa tavoli interattiva (**TODO** già annotato nel Base:
  oggi i tavoli sono card/lista; una mappa vera richiede posizioni dei tavoli
  nel dato — non inventata finché non serve).

---

## Ordine consigliato di costruzione (quando si parte)

1. `plans` + `venues.plan` + gating feature (fondamenta, zero UI).
2. Subscription Stripe Billing (con Connect già attivo).
3. Fee % centralizzate lette dal piano.
4. Prenotazioni esterne manuali (`source`) + check-in manuale esterne.
5. Import AI + token (per ultimo: dipende da 4).

## Fuori da questo documento (già tracciati altrove)

- Stripe Connect / split pagamenti → `docs/STRIPE_CONNECT_PLAN.md`
- Webhook Stripe prod, backup, Resend → TODO pre-lancio (audit 2026-07)
