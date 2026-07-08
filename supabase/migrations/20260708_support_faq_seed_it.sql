-- ============================================================================
-- Let's Night — 2026-07-08 — SEED FAQ (italiano)
-- Primo giro di FAQ, editabili poi da /admin → Assistenza → FAQ.
-- Idempotente: inserisce solo le domande non ancora presenti (guard su lang+question),
-- quindi un re-run non duplica e non sovrascrive le modifiche fatte da admin.
-- Da applicare A MANO nel SQL editor DOPO 20260708_support.sql.
-- ============================================================================

INSERT INTO public.support_faq (lang, category, question, answer, sort_order)
SELECT v.lang, v.category, v.question, v.answer, v.sort_order
FROM (VALUES
  ('it', 'Prenotazioni', 'Come prenoto un evento?',
   'Apri l''evento dalla Home o da Esplora, tocca "Prenota", scegli la quantità e conferma. Se l''evento è a pagamento completi con carta; se è gratuito o a lista la prenotazione è immediata. Trovi il biglietto nella sezione Biglietti.', 10),

  ('it', 'Prenotazioni', 'Posso prenotare più volte lo stesso evento?',
   'No: è ammessa una sola prenotazione per persona per ogni evento. Puoi però indicare la quantità di ingressi al momento della prenotazione, dove l''evento lo consente.', 20),

  ('it', 'Ingresso', 'Come funziona il QR code all''ingresso?',
   'Ogni biglietto ha un QR personale che trovi in Biglietti o aprendo il biglietto. All''ingresso lo staff del locale lo scansiona: il check-in è automatico. Mostra lo schermo alla massima luminosità; non condividere il QR con altri.', 30),

  ('it', 'Pagamenti', 'Quali metodi di pagamento posso usare?',
   'I pagamenti sono gestiti in modo sicuro tramite Stripe con carta di credito o debito. Let''s Night non conserva i dati della tua carta.', 40),

  ('it', 'Rimborsi', 'Posso annullare e ricevere un rimborso?',
   'Puoi chiedere un rimborso dal tuo biglietto. Le richieste vengono verificate dal nostro team: se approvate, viene rimborsato il prezzo del biglietto al netto delle commissioni di servizio. I tempi di accredito dipendono dalla tua banca.', 50),

  ('it', 'Rimborsi', 'Ho pagato ma non sono riuscito a entrare: cosa faccio?',
   'Se non hai potuto entrare (no-show non per tua responsabilità), apri il tuo biglietto al termine della serata e invia la richiesta di rimborso: il team la valuta e, se idonea, procede al rimborso del biglietto al netto delle commissioni.', 60),

  ('it', 'Tavoli', 'Come funziona la prenotazione di un tavolo?',
   'Per gli eventi con tavoli puoi prenotare un tavolo intero o unirti a un tavolo condiviso pagando solo la tua quota. Ogni partecipante riceve il proprio QR. Trovi la quota e i posti disponibili nella scheda del tavolo.', 70),

  ('it', 'Account', 'Come cambio la lingua dell''app?',
   'Vai su Profilo → Impostazioni → Lingua e scegli tra italiano, inglese, spagnolo e francese. La preferenza viene salvata sul tuo account.', 80),

  ('it', 'Account', 'Come elimino il mio account?',
   'Da Profilo → Impostazioni → Elimina account. L''operazione è definitiva e rimuove i tuoi dati personali. Le prenotazioni passate possono essere conservate in forma anonima per obblighi contabili.', 90),

  ('it', 'Notifiche', 'Non ricevo le notifiche, come mai?',
   'Controlla di aver consentito le notifiche a Let''s Night nelle impostazioni del telefono e di avere una connessione attiva. Le notifiche in-app (follow, prenotazioni, risposte dell''assistenza) le trovi comunque nel centro notifiche dell''app.', 100)
) AS v(lang, category, question, answer, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.support_faq f WHERE f.lang = v.lang AND f.question = v.question
);
