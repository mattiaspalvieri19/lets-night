-- ============================================================================
-- Let's Night — 2026-07-08 — SEED FAQ (italiano)
-- Primo giro di FAQ, editabili poi da /admin → Assistenza → FAQ.
-- Idempotente: inserisce solo le domande non ancora presenti (guard su lang+question),
-- quindi un re-run non duplica e non sovrascrive le modifiche fatte da admin.
-- sort_order raggruppa per tema (10-19 prenotazioni, 20-29 ingresso, ...).
-- Da applicare A MANO nel SQL editor DOPO 20260708_support.sql.
-- ============================================================================

INSERT INTO public.support_faq (lang, category, question, answer, sort_order)
SELECT v.lang, v.category, v.question, v.answer, v.sort_order
FROM (VALUES
  -- ---- Prenotazioni (10-19) ----
  ('it', 'Prenotazioni', 'Come prenoto un evento?',
   'Apri l''evento dalla Home o da Esplora, tocca "Prenota", scegli la quantità e conferma. Se l''evento è a pagamento completi in sicurezza con carta; se è gratuito o a lista la prenotazione è immediata. Trovi tutto nella sezione Biglietti.', 10),

  ('it', 'Prenotazioni', 'Dove trovo i miei biglietti?',
   'Nella tab Biglietti dell''app. Ogni biglietto mostra evento, data, locale e il QR d''ingresso. La lista si aggiorna da sola dopo ogni prenotazione.', 11),

  ('it', 'Prenotazioni', 'Posso prenotare più volte lo stesso evento?',
   'È ammessa una sola prenotazione per persona per ciascun evento. Dove l''evento lo consente puoi comunque indicare la quantità di ingressi al momento della prenotazione.', 12),

  ('it', 'Prenotazioni', 'Il biglietto è personale? Posso darlo a un amico?',
   'Sì, il biglietto e il suo QR sono personali e vanno mostrati da chi ha prenotato. Non condividere il QR: se viene scansionato da qualcun altro non potrai più entrare tu. Invita gli amici a prenotare il proprio ingresso.', 13),

  ('it', 'Prenotazioni', 'Posso modificare o annullare una prenotazione?',
   'Puoi chiedere l''annullamento con rimborso dal tuo biglietto (vedi la sezione Rimborsi). Per cambiare quantità o data, annulla e prenota di nuovo, se ci sono ancora posti disponibili.', 14),

  -- ---- Ingresso (20-29) ----
  ('it', 'Ingresso', 'Come funziona il QR code all''ingresso?',
   'Ogni biglietto ha un QR personale, che trovi in Biglietti o aprendo il biglietto. All''ingresso lo staff del locale lo scansiona e il check-in è automatico. Tieni lo schermo alla massima luminosità.', 20),

  ('it', 'Ingresso', 'Serve un documento? C''è un''età minima?',
   'Porta sempre un documento d''identità valido: all''ingresso può essere richiesto. L''età minima dipende dal singolo evento/locale ed è indicata nella scheda dell''evento quando prevista.', 21),

  ('it', 'Ingresso', 'C''è un dress code?',
   'Alcuni locali richiedono un dress code: quando previsto lo trovi indicato nella scheda dell''evento. In assenza di indicazioni vale il buon senso del locale.', 22),

  -- ---- Pagamenti (30-39) ----
  ('it', 'Pagamenti', 'Quali metodi di pagamento posso usare?',
   'I pagamenti sono gestiti in modo sicuro tramite Stripe con carta di credito o debito.', 30),

  ('it', 'Pagamenti', 'I miei dati di pagamento sono al sicuro?',
   'Sì. I pagamenti passano da Stripe, provider certificato: Let''s Night non vede né conserva i dati della tua carta.', 31),

  ('it', 'Pagamenti', 'Ho pagato ma non vedo il biglietto: cosa faccio?',
   'Apri la tab Biglietti e trascina verso il basso per aggiornare: la conferma può richiedere qualche istante. Se dopo qualche minuto non compare, aprine un ticket da qui indicando data e importo: lo verifichiamo noi.', 32),

  -- ---- Rimborsi (40-49) ----
  ('it', 'Rimborsi', 'Posso ricevere un rimborso?',
   'Puoi inviare una richiesta di rimborso dal tuo biglietto. Ogni richiesta viene verificata dal team: se approvata, viene rimborsato il prezzo del biglietto al netto delle commissioni di servizio. I tempi di accredito dipendono dalla tua banca.', 40),

  ('it', 'Rimborsi', 'L''evento è stato annullato o rinviato: cosa succede?',
   'Se un evento viene annullato ricevi il rimborso della prenotazione. In caso di rinvio, il biglietto resta valido per la nuova data; se non puoi partecipare, richiedi il rimborso dal biglietto.', 41),

  ('it', 'Rimborsi', 'Ho pagato ma non sono riuscito a entrare (no-show)?',
   'Se non hai potuto entrare per motivi non dipendenti da te, apri il biglietto al termine della serata e invia la richiesta di rimborso: il team la valuta e, se idonea, rimborsa il biglietto al netto delle commissioni.', 42),

  -- ---- Tavoli (50-59) ----
  ('it', 'Tavoli', 'Come funziona la prenotazione di un tavolo?',
   'Per gli eventi con tavoli puoi prenotare un tavolo intero oppure unirti a un tavolo condiviso pagando solo la tua quota. Ogni partecipante riceve il proprio QR. Quota e posti disponibili sono indicati nella scheda del tavolo.', 50),

  -- ---- Account e app (60-79) ----
  ('it', 'Account', 'Come cambio la lingua dell''app?',
   'Vai su Profilo → Impostazioni → Lingua e scegli tra italiano, inglese, spagnolo e francese. La preferenza viene salvata sul tuo account.', 60),

  ('it', 'Account', 'Come elimino il mio account?',
   'Da Profilo → Impostazioni → Elimina account. L''operazione è definitiva e rimuove i tuoi dati personali. Alcune informazioni sulle prenotazioni passate possono essere conservate in forma anonima per obblighi contabili.', 61),

  ('it', 'Notifiche', 'Non ricevo le notifiche, come mai?',
   'Controlla di aver consentito le notifiche a Let''s Night nelle impostazioni del telefono e di avere una connessione attiva. Le notifiche in-app (follow, prenotazioni, risposte dell''assistenza) le trovi comunque nel centro notifiche dell''app.', 62),

  ('it', 'Città', 'In quali città è disponibile Let''s Night?',
   'Al momento Let''s Night è attivo su Milano, con nuovi locali ed eventi aggiunti di continuo. Stiamo lavorando per arrivare presto in altre città.', 63),

  -- ---- Locali / partner (80-89) ----
  ('it', 'Locali', 'Gestisco un locale: come pubblico i miei eventi?',
   'Registra un account business dal portale locali: da lì puoi creare eventi, gestire prenotazioni e tavoli e scansionare i QR all''ingresso. Per diventare partner verificato scrivici pure aprendo un ticket.', 80)
) AS v(lang, category, question, answer, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.support_faq f WHERE f.lang = v.lang AND f.question = v.question
);
