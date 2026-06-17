# Modello Pagamenti, Rimborsi e Stripe Connect — Piano

> Documento di riferimento. Cattura il modello deciso, cosa è già implementato,
> cosa è in sospeso e cosa è **bloccato** finché non si attiva Stripe Connect.
> Ultimo aggiornamento: 2026-06-17.

---

## 1. Come scorre il denaro OGGI (senza Connect)

- L'utente paga con **Stripe Checkout** → i soldi arrivano sul **conto Stripe della piattaforma (Mattia)**.
- Il **locale NON viene pagato tramite Stripe**: oggi non c'è alcuno split. Il payout al locale è fuori-piattaforma (manuale/accordo).
- I **rimborsi** partono dal saldo della piattaforma (`refunds.create` su `payment_intent`) → funzionano **senza Connect**.
- La tabella `bookings` ha già: `fee` (default 1,50), `stripe_session_id` (UNIQUE, idempotenza), `status` (`pending|confirmed|cancelled|denied`), `checked_in` + `checked_in_at`, e (post-migration 20260610) `refund_reason`, `refunded_at`.

**Conseguenza pratica:** tutta la logica **check-in / rifiuto / rimborso** si può costruire ORA. Solo lo **split automatico del ricavo** (10% a te, resto al locale) richiede Connect.

---

## 2. Nuovo modello CHECK-IN / RIMBORSO (deciso)

| Evento | Comportamento |
|---|---|
| **Scan QR valido** | **Check-in automatico** immediato. Nessun tap "Conferma". Scan = entrato = **nessun rimborso** per l'utente. |
| **Ri-scan** dello stesso QR | Mostra **"⚠️ Già scannerizzato"** + nome/foto per verifica. Il QR **resta visibile e scannerizzabile** (rientri ammessi). |
| **Locale rifiuta** (tasto "Rifiuta e rimborsa") | Prenotazione annullata + **rimborso pieno** + `checked_in` azzerato. La **fee Stripe resta a carico del locale** (vedi §4). Prerogativa del locale, sempre disponibile. |
| **Utente no-show** (nessuno scan, nessun check-in) | L'utente può **richiedere** il rimborso **solo dopo l'orario di fine serata** (`end_time`). Rimborso **meno la fee** (la fee Stripe resta a carico dell'utente). |
| **Bug scanner** | Il locale può fare check-in **manuale** dalla lista Prenotazioni (già esistente). |

### Stato implementazione

**✅ Fatto in questa sessione**
- Scan → check-in automatico (scanner mobile). Banner verde **"INGRESSO REGISTRATO"** con orario.
- Ri-scan → banner ambra **"Già scannerizzato"**, rientro consentito.
- "Rifiuta e rimborsa" funziona **anche dopo** il check-in automatico e **azzera `checked_in`** (chi è rifiutato non resta "presente" nelle statistiche).
- **`end_time` obbligatorio** sui **nuovi** eventi (dashboard web + form mobile). La colonna esiste già (`events.end_time time`).

**⏳ In sospeso (NON ancora costruito)**
- **Flusso rimborso utente no-show**: pulsante lato utente che appare **solo dopo `end_time`** se `checked_in = false`; rimborso **parziale** (prezzo − `fee`). Richiede:
  1. La **decisione di policy** del §3 (auto vs approvazione).
  2. Logica partial-refund in `refundBooking.js` (parametro `amount` = `total_price − fee`).
  3. Gestione **eventi senza `end_time`** (quelli vecchi hanno `NULL`): fallback = `event_date` + orario di default (es. 06:00 del giorno dopo) **oppure** blocca la richiesta finché il locale non imposta `end_time`. Raccomando il fallback per non bloccare l'utente.
- **Backfill `end_time`** sugli eventi esistenti (opzionale, o si usa il fallback).

---

## 3. ⚠️ DECISIONE APERTA — da confermare

**Il rimborso "no-show dopo fine serata" è automatico o richiede approvazione?**

- **Opzione A — Richiesta con approvazione (RACCOMANDATA).** L'utente *richiede*; il locale (o admin) approva dal dashboard. Coerente con il modello anti-frode attuale ("non mi hanno fatto entrare" non è auto-attivabile). Evita l'abuso: *entro mostrando il QR a un locale che non scanna, poi a fine serata dichiaro che non sono andato e ottengo il rimborso*. La parola usata era "**può richiedere** rimborso" → è una richiesta, non un click che muove denaro.
- **Opzione B — Auto-rimborso.** Se `checked_in = false` e `now > end_time`, rimborso immediato (meno fee). Più comodo per l'utente, ma espone i locali che non scannano in modo affidabile.

**Mia raccomandazione: A** (facile da trasformare in B con un toggle in futuro). Da confermare prima di costruire il flusso utente.

---

## 4. Stripe Connect — modello fee (OBIETTIVO)

**Obiettivo:** l'utente paga **solo il prezzo del biglietto**. Stripe trattiene la fee al locale, manda **10% a te**, e il **resto al locale**.

**Meccanismo:** **Destination charge** con `application_fee_amount`.
- Charge sul conto piattaforma, `payment_intent_data.application_fee_amount = 10%` del prezzo → resta a te.
- `payment_intent_data.transfer_data.destination = <connected_account_locale>` → Stripe trasferisce il resto al locale.
- Per mettere la **fee Stripe a carico del locale** (e renderlo merchant of record): valutare `on_behalf_of = <connected_account>`. *La meccanica esatta del fee-bearing va verificata con la doc Stripe aggiornata al momento dell'attivazione (usa context7 / Stripe docs).*
- Sui **rimborsi**: usare `refund_application_fee: true` + `reverse_transfer: true` così lo storno tocca **sia la tua commissione sia la quota del locale**.

### Le 8 decisioni (con default raccomandati)

1. **Tipo account** → **Express** (onboarding ospitato da Stripe, KYC gestito da Stripe, dashboard Express per il locale). No Standard/Custom.
2. **Gating** → un locale può pubblicare eventi **a pagamento** solo dopo onboarding completo (`charges_enabled && payouts_enabled`). Eventi **gratuiti / "lista"** sempre permessi.
3. **Chi/P.IVA** → solo locali **verificati**, tipo **company** (attività con P.IVA). Stripe raccoglie i dati fiscali in onboarding.
4. **Payout vs finestra rimborso (CRITICO)** → il locale non deve incassare soldi che potresti dover rimborsare. Raccomando: **destination charge immediato** + sui rimborsi `reverse_transfer` (storno dal locale) + **payout schedule del connected account ritardato** (es. +2 giorni) come cuscinetto. In alternativa: trattenere il transfer al locale fino a `end_time` + X ore.
5. **Fee & chargeback** → Stripe fee a carico locale (§4). Chargeback: per default colpisce la **piattaforma**; all'inizio tieni la responsabilità tua (controlli il rischio) e recuperi la quota locale con `reverse_transfer`.
6. **Commissione 10% & la `fee` da 1,50** → oggi l'utente paga *prezzo + 1,50*. Nuovo modello = "solo prezzo" + tuo ricavo = 10%. **Decidere**: eliminare la 1,50 (ricavo solo dal 10%) oppure tenerla come "fee di servizio" esplicita. Default coerente con la richiesta: **solo prezzo biglietto + 10%**.
7. **UX onboarding** → sezione **"Pagamenti"** nel dashboard business con stato (Non collegato / In verifica / Attivo) + pulsante **"Collega pagamenti"** → Stripe **Account Link** → ritorno. Eventi a pagamento bloccati finché non Attivo, con messaggio chiaro.
8. **Legale/fiscale** → Express: Stripe gestisce KYC; tu emetti **fattura per la commissione 10%** al locale. Accettazione **Stripe Connected Account Agreement** in onboarding. Verificare IVA sulla commissione con commercialista. Non blocca il tecnico, ma da sistemare **prima del lancio a pagamento reale**.

---

## 5. 🔒 BLOCCATO finché non si attiva Connect

Niente di tutto questo è costruibile finché su Stripe non si attiva **Connect** (Dashboard Stripe → Connect → abilita piattaforma):

- [ ] Attivare **Stripe Connect** sull'account piattaforma + scegliere **Express**.
- [ ] Creare i **Connected Account** per i locali + **Account Link** (onboarding ospitato).
- [ ] Passare il Checkout a **destination charge** (`application_fee_amount` + `transfer_data.destination`).
- [ ] Webhook Connect (`account.updated`, `payout.*`) + persistere `stripe_account_id` su `venues`.
- [ ] Adeguare i **rimborsi** a `reverse_transfer` + `refund_application_fee`.
- [ ] Sezione **Pagamenti** nel dashboard business + **gating** eventi a pagamento.
- [ ] Decidere destino della **`fee` 1,50** (§4.6).

Finché Connect non è attivo: i pagamenti continuano a finire sul conto piattaforma e il payout ai locali è fuori-piattaforma. **Il modello check-in/rimborso (§2) funziona comunque**, perché i rimborsi escono dal saldo piattaforma.

---

## 6. File che cambieranno all'attivazione di Connect

- `apps/web/app/api/stripe/checkout-session/route.js` — destination charge.
- `apps/web/lib/refundBooking.js` — `reverse_transfer` + `refund_application_fee` + (per no-show) parametro `amount` parziale.
- `apps/web/lib/fulfillBooking.js` — eventuale lettura `application_fee` / transfer.
- **Nuovo**: `apps/web/app/api/stripe/connect/*` — onboarding Account Link + return.
- `apps/web/app/business/dashboard/page.js` — sezione "Pagamenti" + gating.
- `venues` (DB) — colonna `stripe_account_id` + stato onboarding.
- Webhook Stripe — gestire eventi Connect.
