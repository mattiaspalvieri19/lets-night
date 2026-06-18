import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

let _stripe;
function stripe() {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Nega l'ingresso a una prenotazione e, se pagata, la rimborsa.
// AUTORIZZAZIONE: solo l'owner del locale dell'evento, oppure un admin.
// L'utente NON può mai chiamare questo flusso: il rimborso nasce sempre da
// un'azione del locale (scanner "Nega ingresso" o dashboard business), così
// "non mi hanno fatto entrare" non è auto-attivabile da chi mente.
// Idempotente: se già denied/cancelled non rifà nulla.
export async function denyAndRefundBooking({ bookingId, callerUserId, reason }) {
  if (!bookingId || typeof bookingId !== 'string') {
    return { error: 'bookingId mancante', status: 400 };
  }
  if (!callerUserId) {
    return { error: 'Non autenticato', status: 401 };
  }

  const supabase = adminClient();

  const { data: booking, error } = await supabase
    .from('bookings')
    .select('id, status, stripe_session_id, events(venue_id, venues(owner_id))')
    .eq('id', bookingId)
    .maybeSingle();

  if (error || !booking) {
    return { error: 'Prenotazione non trovata', status: 404 };
  }

  // Autorizzazione: venue owner dell'evento oppure admin.
  const ownerId = booking.events?.venues?.owner_id || null;
  let authorized = !!ownerId && ownerId === callerUserId;
  if (!authorized) {
    const { data: adminRow } = await supabase
      .from('admins')
      .select('user_id')
      .eq('user_id', callerUserId)
      .maybeSingle();
    authorized = !!adminRow;
  }
  if (!authorized) {
    return { error: 'Non autorizzato a gestire questa prenotazione', status: 403 };
  }

  // Idempotenza: già gestita.
  if (booking.status === 'denied' || booking.status === 'cancelled') {
    return { ok: true, alreadyProcessed: true, refunded: false };
  }

  // Refund Stripe solo se la prenotazione era a pagamento.
  let refunded = false;
  if (booking.stripe_session_id) {
    try {
      const session = await stripe().checkout.sessions.retrieve(booking.stripe_session_id);
      const pi = typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id;
      if (pi) {
        await stripe().refunds.create({
          payment_intent: pi,
          reason: 'requested_by_customer',
          metadata: { letsnight_reason: reason || 'denied_entry', booking_id: bookingId },
        }, { idempotencyKey: `deny_refund_${bookingId}` });
        refunded = true;
      }
    } catch (e) {
      console.error('[DENY_REFUND_STRIPE_FAILED]', e.message);
      return { error: 'Rimborso non riuscito. Riprova o gestiscilo da Stripe.', status: 502 };
    }
  }

  // Update CRITICO: denied + QR invalidato. Non dipende dalle colonne della
  // migration 20260610, così funziona anche se non è ancora stata applicata
  // (evita lo stato pericoloso "rimborsato ma QR ancora valido").
  // (Il webhook charge.refunded che seguirà NON sovrascrive 'denied' —
  // vedi fulfillBooking.cancelBookingByPaymentIntent.)
  // checked_in azzerato: con lo scan il check-in è automatico, ma se il locale
  // rifiuta la persona NON è entrata — non deve restare "presente" nelle stat.
  const { error: updErr } = await supabase
    .from('bookings')
    .update({ status: 'denied', qr_code: null, checked_in: false })
    .eq('id', bookingId);

  if (updErr) {
    console.error('[DENY_UPDATE_FAILED]', updErr);
    return { error: 'Rimborso avviato ma stato non aggiornato. Contatta il supporto.', status: 500 };
  }

  // Best-effort: colonne di audit (presenti solo dopo la migration 20260610).
  // Un fallimento qui non è critico — la prenotazione è già denied + QR nullo.
  await supabase
    .from('bookings')
    .update({
      refund_reason: reason || 'Ingresso negato dal locale',
      refunded_at: refunded ? new Date().toISOString() : null,
    })
    .eq('id', bookingId)
    .then(({ error: e }) => { if (e) console.warn('[DENY_AUDIT_SKIP]', e.message); });

  return { ok: true, refunded };
}

// ── Rimborso "no-show" su richiesta utente + approvazione ADMIN ──────────────

// "Adesso" in Europe/Rome come "YYYY-MM-DD HH:MM:SS" (confronto lessicale = cronologico).
function romeNowStr() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' });
}
function addOneDay(ymd) {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
// Fine effettiva della serata (Rome local). end_time assente → si assume fine alle 06:00
// del giorno dopo; end_time <= inizio → la serata scavalca la mezzanotte (fine il giorno dopo).
function effectiveEndStr(ev) {
  const date = ev?.event_date;
  if (!date) return null;
  const start = (ev.event_time || '00:00').slice(0, 5);
  const endClock = ev.end_time ? ev.end_time.slice(0, 5) : '06:00';
  let endDate = date;
  if (!ev.end_time || endClock <= start) endDate = addOneDay(date);
  return `${endDate} ${endClock}:00`;
}
function pastEventEnd(ev) {
  const end = effectiveEndStr(ev);
  return end ? romeNowStr() > end : false;
}

// L'utente richiede il rimborso. NON muove denaro: marca solo la richiesta.
// Eleggibilità validata SERVER-side: propria prenotazione, a pagamento, non
// entrato, attiva, e SOLO dopo la fine della serata.
export async function requestNoShowRefund({ bookingId, callerUserId }) {
  if (!bookingId || typeof bookingId !== 'string') return { error: 'bookingId mancante', status: 400 };
  if (!callerUserId) return { error: 'Non autenticato', status: 401 };

  const supabase = adminClient();
  const { data: b, error } = await supabase
    .from('bookings')
    .select('id, status, checked_in, user_id, stripe_session_id, refund_requested_at, events(event_date, event_time, end_time)')
    .eq('id', bookingId)
    .maybeSingle();

  if (error || !b) return { error: 'Prenotazione non trovata', status: 404 };
  if (b.user_id !== callerUserId) return { error: 'Non autorizzato', status: 403 };
  if (b.status === 'cancelled' || b.status === 'denied') return { error: 'Prenotazione già annullata o rimborsata', status: 409 };
  if (b.checked_in) return { error: 'Risulti già entrato: il rimborso non è disponibile', status: 409 };
  if (!b.stripe_session_id) return { error: 'Prenotazione gratuita: nessun rimborso da richiedere', status: 400 };
  if (!pastEventEnd(b.events)) return { error: 'Puoi richiedere il rimborso solo dopo la fine della serata', status: 409 };
  if (b.refund_requested_at) return { ok: true, alreadyRequested: true };

  const { error: upd } = await supabase
    .from('bookings')
    .update({ refund_requested_at: new Date().toISOString(), refund_request_reason: 'No-show: richiesta dopo la fine serata' })
    .eq('id', bookingId);
  if (upd) { console.error('[REFUND_REQUEST_FAILED]', upd); return { error: 'Richiesta non salvata, riprova', status: 500 }; }
  return { ok: true };
}

// L'ADMIN approva o rifiuta la richiesta. Approvazione = rimborso PARZIALE
// (prezzo − fee). Solo admin (no venue). Idempotente.
export async function resolveRefundRequest({ bookingId, callerUserId, action }) {
  if (!bookingId || typeof bookingId !== 'string') return { error: 'bookingId mancante', status: 400 };
  if (!callerUserId) return { error: 'Non autenticato', status: 401 };
  if (action !== 'approve' && action !== 'reject') return { error: 'Azione non valida', status: 400 };

  const supabase = adminClient();
  const { data: adminRow } = await supabase.from('admins').select('user_id').eq('user_id', callerUserId).maybeSingle();
  if (!adminRow) return { error: 'Riservato agli amministratori', status: 403 };

  const { data: b, error } = await supabase
    .from('bookings')
    .select('id, status, checked_in, stripe_session_id, total_price, fee, refund_requested_at, user_id, event_id, events(title)')
    .eq('id', bookingId)
    .maybeSingle();
  if (error || !b) return { error: 'Prenotazione non trovata', status: 404 };
  if (!b.refund_requested_at) return { error: 'Nessuna richiesta di rimborso per questa prenotazione', status: 409 };

  if (action === 'reject') {
    const { error: upd } = await supabase
      .from('bookings')
      .update({ refund_requested_at: null, refund_request_reason: null })
      .eq('id', bookingId);
    if (upd) return { error: 'Aggiornamento non riuscito', status: 500 };
    await notifyRefundOutcome(supabase, b, false);
    return { ok: true, rejected: true };
  }

  // approve
  if (b.status === 'cancelled' || b.status === 'denied') return { ok: true, alreadyProcessed: true };
  if (b.checked_in) return { error: 'L\'ospite risulta entrato: non rimborsare', status: 409 };

  // Interim (pre-Connect): no-show → rimborso del PREZZO DEL BIGLIETTO (total_price). L'utente
  // perde solo la booking fee, gia pagata a parte (total_price NON include la fee). Col modello
  // Connect "utente paga solo il biglietto" questo cambierà.
  const amount = Math.max(0, Number(b.total_price) || 0);

  let refunded = false;
  if (b.stripe_session_id && amount > 0) {
    try {
      const session = await stripe().checkout.sessions.retrieve(b.stripe_session_id);
      const pi = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
      if (pi) {
        // Idempotency key: un secondo "Approva" (es. dopo un update DB fallito) NON rifà il refund.
        await stripe().refunds.create({
          payment_intent: pi,
          amount: Math.round(amount * 100),
          reason: 'requested_by_customer',
          metadata: { letsnight_reason: 'no_show_refund', booking_id: bookingId },
        }, { idempotencyKey: `noshow_refund_${bookingId}` });
        refunded = true;
      }
    } catch (e) {
      console.error('[NOSHOW_REFUND_STRIPE_FAILED]', e.message);
      return { error: 'Rimborso Stripe non riuscito. Riprova o gestiscilo da Stripe.', status: 502 };
    }
  }

  const { error: upd } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      qr_code: null,
      refund_requested_at: null,
      refund_reason: 'Rimborso no-show approvato',
      refunded_at: refunded ? new Date().toISOString() : null,
    })
    .eq('id', bookingId);
  if (upd) { console.error('[NOSHOW_REFUND_UPDATE_FAILED]', upd); return { error: 'Rimborso avviato ma stato non aggiornato. Contatta il supporto.', status: 500 }; }
  await notifyRefundOutcome(supabase, b, true, amount);
  return { ok: true, refunded, amount };
}

// Notifica all'utente l'esito della richiesta di rimborso. Best-effort: non blocca il flusso.
async function notifyRefundOutcome(supabase, booking, approved, amount) {
  const title = booking?.events?.title || 'il tuo evento';
  await supabase.from('notifications').insert({
    user_id: booking.user_id,
    type: 'generic',
    title: approved ? 'Rimborso approvato' : 'Richiesta di rimborso non accolta',
    body: approved
      ? `La tua richiesta di rimborso per "${title}" è stata approvata: ${Number(amount || 0).toFixed(2).replace('.', ',')} € in elaborazione.`
      : `La tua richiesta di rimborso per "${title}" non è stata accolta. Per dubbi scrivi al supporto.`,
    event_id: booking.event_id || null,
    booking_id: booking.id,
  }).then(({ error }) => { if (error) console.warn('[REFUND_NOTIFY_SKIP]', error.message); });
}
