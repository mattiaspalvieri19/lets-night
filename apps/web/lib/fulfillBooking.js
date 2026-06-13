import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { generateBookingQR, computeBookingPrice, BOOKING_FEE } from '@lets-night/shared';

let _stripe;
function stripe() {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

// Verifica coerenza tra modalità chiave e modalità sessione: evita di mischiare dev/prod o test/live.
function livemodeMismatch(stripeSession) {
  const key = process.env.STRIPE_SECRET_KEY || '';
  const keyIsLive = key.startsWith('sk_live_');
  return keyIsLive !== !!stripeSession.livemode;
}

// Idempotente: dato uno Stripe session paid, crea (o ritorna) la booking.
// Chiamabile sia da /api/stripe/webhook (source of truth) sia da /api/stripe/confirm-booking (fallback sincrono).
export async function fulfillBookingFromSession(stripeSession) {
  if (!stripeSession || stripeSession.payment_status !== 'paid') {
    return { error: 'Pagamento non completato', status: 402 };
  }
  if (stripeSession.mode !== 'payment') {
    return { error: 'Modalità sessione non valida', status: 400 };
  }
  if (livemodeMismatch(stripeSession)) {
    return { error: 'Chiave Stripe e sessione non coerenti (test/live)', status: 400 };
  }

  const md = stripeSession.metadata || {};
  if (!md.eventId || !md.userId) {
    return { error: 'Metadata mancante', status: 400 };
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Idempotency: se già processata questa session, ritorna il booking esistente.
  const { data: existing } = await supabase
    .from('bookings')
    .select('id, qr_code, table_id')
    .eq('stripe_session_id', stripeSession.id)
    .maybeSingle();

  if (existing) {
    return { ok: true, bookingId: existing.id, qrCode: existing.qr_code, tableId: existing.table_id, alreadyExisted: true };
  }

  // Quote tavolo: flusso dedicato (apertura/join con trigger di guardia + auto-refund).
  if (md.kind === 'table') {
    return fulfillTableShare(supabase, stripeSession, md);
  }

  const eventId = md.eventId;
  const userId = md.userId;
  const requestedQty = Math.max(1, Number(md.quantity) || 1);
  const requestedType = md.bookingType || 'ticket';

  const { data: event } = await supabase
    .from('events')
    .select('price, table_price, has_tables, capacity, booked_count')
    .eq('id', eventId)
    .maybeSingle();

  if (!event) {
    return { error: 'Evento non trovato', status: 404 };
  }

  const pricing = computeBookingPrice(event, requestedType, requestedQty);

  // Critical: l'importo addebitato da Stripe deve combaciare col prezzo ricalcolato.
  // Se il venue ha cambiato prezzo tra checkout-session e fulfillment, Stripe ha incassato
  // X e il DB salverebbe Y. Rifiutiamo e rimborsiamo per mantenere allineamento.
  const expectedCents = Math.round((pricing.lineTotal + pricing.fee) * 100);
  if (stripeSession.amount_total !== expectedCents) {
    await refundAndAlert(stripeSession, 'price_changed', { expectedCents, actualCents: stripeSession.amount_total });
    return { error: 'Prezzo dell\'evento cambiato dopo il pagamento. Rimborso elaborato automaticamente.', status: 409, refunded: true };
  }

  // Capacity check: rigetta se l'evento si è riempito tra checkout e payment.
  if (event.capacity != null && (event.booked_count || 0) + pricing.safeQty > event.capacity) {
    await refundAndAlert(stripeSession, 'oversold', { eventId, qty: pricing.safeQty });
    return { error: 'Posti esauriti dopo il pagamento. Rimborso elaborato automaticamente.', status: 409, oversold: true, refunded: true };
  }

  // Snapshot del nome per resistere a rename post-checkin
  const { data: prof } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .maybeSingle();

  const qrCode = generateBookingQR();

  const { data: booking, error: bookErr } = await supabase
    .from('bookings')
    .insert({
      user_id: userId,
      event_id: eventId,
      status: 'confirmed',
      quantity: pricing.safeQty,
      total_price: pricing.lineTotal,
      fee: pricing.fee,
      qr_code: qrCode,
      booking_type: pricing.bookingType,
      stripe_session_id: stripeSession.id,
      snapshot_full_name: prof?.full_name || null,
    })
    .select('id, qr_code')
    .single();

  if (bookErr) {
    if (bookErr.code === '23505') {
      // Race webhook + confirm-booking concorrenti: ritorna l'esistente per questa session.
      const { data: now } = await supabase
        .from('bookings')
        .select('id, qr_code')
        .eq('stripe_session_id', stripeSession.id)
        .maybeSingle();
      if (now) return { ok: true, bookingId: now.id, qrCode: now.qr_code, alreadyExisted: true };

      // Caso diverso: 23505 ma niente booking per questa session → violazione UNIQUE (user_id, event_id).
      // L'utente ha pagato per qualcosa che possedeva già. Refund automatico + segnala.
      await refundAndAlert(stripeSession, 'duplicate_booking', { userId, eventId });
      return { error: 'Avevi già una prenotazione attiva per questo evento. Il pagamento è stato rimborsato automaticamente.', status: 409, refunded: true, duplicate: true };
    }
    // Trigger capacity guard (enforce_event_capacity): l'evento si è riempito durante
    // una race oltre il check applicativo sopra. Rimborso automatico come oversold.
    if (bookErr.code === '23514' || /CAPACITY_FULL/.test(bookErr.message || '')) {
      await refundAndAlert(stripeSession, 'oversold', { eventId, qty: pricing.safeQty });
      return { error: 'Posti esauriti dopo il pagamento. Rimborso elaborato automaticamente.', status: 409, oversold: true, refunded: true };
    }
    console.error('Insert booking fallita:', bookErr);
    return { error: 'Errore creazione prenotazione', status: 500 };
  }

  return { ok: true, bookingId: booking.id, qrCode: booking.qr_code };
}

// Fulfillment quota tavolo (open/join). I trigger DB sono la verità atomica:
// TABLES_FULL / TABLE_SEATS_FULL / SHARE_EXCEEDS_REMAINING / TABLE_NOT_OPEN
// → qui li catturiamo e rimborsiamo automaticamente.
async function fulfillTableShare(supabase, stripeSession, md) {
  const share = Math.max(0, Number(md.share) || 0);
  const expectedCents = Math.round((share + BOOKING_FEE) * 100);
  if (stripeSession.amount_total !== expectedCents) {
    await refundAndAlert(stripeSession, 'table_amount_mismatch', { expectedCents, actualCents: stripeSession.amount_total });
    return { error: 'Importo non coerente. Rimborso elaborato automaticamente.', status: 409, refunded: true };
  }

  let tableId = md.tableId || null;
  // Se apriamo NOI il tavolo in questa chiamata e poi la quota viene rifiutata, il
  // tavolo resterebbe orfano (0 membri, occupa uno slot tables_count, appare come
  // tavolo pubblico fantasma). Teniamo traccia per poterlo rimuovere (rollback).
  let createdTableId = null;

  if (md.tableAction === 'open') {
    // Dedup apertura: la session può essere processata da webhook E confirm-booking.
    const { data: already } = await supabase
      .from('event_tables')
      .select('id')
      .eq('stripe_session_id', stripeSession.id)
      .maybeSingle();

    if (already) {
      tableId = already.id;
    } else {
      const { data: type } = await supabase
        .from('event_table_types')
        .select('id, event_id, total_price, max_people')
        .eq('id', md.typeId)
        .maybeSingle();
      if (!type || type.event_id !== md.eventId) {
        await refundAndAlert(stripeSession, 'table_type_missing', { typeId: md.typeId });
        return { error: 'Tipologia tavolo non più disponibile. Rimborso elaborato automaticamente.', status: 409, refunded: true };
      }

      const { data: created, error: tErr } = await supabase
        .from('event_tables')
        .insert({
          event_id: md.eventId,
          type_id: md.typeId,
          created_by: md.userId,
          visibility: md.visibility === 'private' ? 'private' : 'public',
          total_price: type.total_price,
          max_people: type.max_people,
          stripe_session_id: stripeSession.id,
        })
        .select('id')
        .single();

      if (tErr) {
        if (tErr.code === '23505') {
          // Race sull'UNIQUE session_id: l'altro processo ha già creato il tavolo.
          const { data: again } = await supabase
            .from('event_tables').select('id').eq('stripe_session_id', stripeSession.id).maybeSingle();
          if (again) tableId = again.id;
        } else if (tErr.code === '23514' || /TABLES_FULL/.test(tErr.message || '')) {
          await refundAndAlert(stripeSession, 'tables_full', { typeId: md.typeId });
          return { error: 'Tavoli esauriti per questa tipologia. Rimborso elaborato automaticamente.', status: 409, refunded: true };
        }
        if (!tableId) {
          console.error('Insert event_tables fallita:', tErr);
          return { error: 'Errore creazione tavolo', status: 500 };
        }
      } else {
        tableId = created.id;
        createdTableId = created.id;
      }
    }
  }

  if (!tableId) {
    return { error: 'Tavolo mancante', status: 400 };
  }

  // Rollback del tavolo appena aperto se la quota non va a buon fine: lo eliminiamo
  // solo se non ha membri attivi (per definizione, appena creato, 0 → safe).
  async function rollbackCreatedTable() {
    if (!createdTableId) return;
    const { count } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('table_id', createdTableId)
      .not('status', 'in', '("cancelled","denied")');
    if (!count) await supabase.from('event_tables').delete().eq('id', createdTableId);
  }

  const { data: prof } = await supabase
    .from('profiles').select('full_name').eq('id', md.userId).maybeSingle();

  const qrCode = generateBookingQR();
  const { data: booking, error: bookErr } = await supabase
    .from('bookings')
    .insert({
      user_id: md.userId,
      event_id: md.eventId,
      status: 'confirmed',
      quantity: 1,
      total_price: share,
      fee: BOOKING_FEE,
      qr_code: qrCode,
      booking_type: 'table_share',
      table_id: tableId,
      stripe_session_id: stripeSession.id,
      snapshot_full_name: prof?.full_name || null,
    })
    .select('id, qr_code')
    .single();

  if (bookErr) {
    if (bookErr.code === '23505') {
      const { data: now } = await supabase
        .from('bookings').select('id, qr_code').eq('stripe_session_id', stripeSession.id).maybeSingle();
      if (now) return { ok: true, bookingId: now.id, qrCode: now.qr_code, tableId, alreadyExisted: true };
      // UNIQUE (user, table): aveva già una quota in questo tavolo.
      await refundAndAlert(stripeSession, 'table_duplicate_member', { userId: md.userId, tableId });
      await rollbackCreatedTable();
      return { error: 'Fai già parte di questo tavolo. Il pagamento è stato rimborsato automaticamente.', status: 409, refunded: true };
    }
    if (bookErr.code === '23514' || /TABLE_SEATS_FULL|SHARE_EXCEEDS_REMAINING|TABLE_NOT_OPEN|TABLE_CANCELLED|SHARE_BELOW_MIN/.test(bookErr.message || '')) {
      await refundAndAlert(stripeSession, 'table_share_rejected', { tableId, detail: bookErr.message });
      await rollbackCreatedTable();
      const msg = /SEATS_FULL/.test(bookErr.message || '')
        ? 'Il tavolo si è riempito durante il pagamento. Rimborso elaborato automaticamente.'
        : /EXCEEDS/.test(bookErr.message || '')
        ? 'La quota superava il residuo del tavolo. Rimborso elaborato automaticamente.'
        : 'Il tavolo non è più disponibile. Rimborso elaborato automaticamente.';
      return { error: msg, status: 409, refunded: true };
    }
    await rollbackCreatedTable();
    console.error('Insert quota tavolo fallita:', bookErr);
    return { error: 'Errore creazione quota', status: 500 };
  }

  return { ok: true, bookingId: booking.id, qrCode: booking.qr_code, tableId };
}

// Refund automatico + log anomalia. Best-effort: se Stripe è down, logghiamo e procediamo.
async function refundAndAlert(stripeSession, reason, details = {}) {
  console.error('[PAYMENT_ANOMALY]', { reason, sessionId: stripeSession.id, ...details });
  try {
    if (stripeSession.payment_intent) {
      await stripe().refunds.create({
        payment_intent: typeof stripeSession.payment_intent === 'string'
          ? stripeSession.payment_intent
          : stripeSession.payment_intent.id,
        reason: 'requested_by_customer',
        metadata: {
          letsnight_reason: reason,
          session_id: stripeSession.id,
        },
      });
    }
  } catch (e) {
    console.error('[REFUND_FAILED]', { sessionId: stripeSession.id, reason, error: e.message });
  }
}

// Cancella un booking dato un payment_intent (per refund/dispute manuali via Stripe dashboard).
export async function cancelBookingByPaymentIntent(paymentIntentId, reason) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  // Risali al session.id via Stripe list (più affidabile che storare PI separatamente).
  let sessionId = null;
  try {
    const sessions = await stripe().checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 });
    sessionId = sessions.data[0]?.id;
  } catch (e) {
    console.error('[CANCEL_LOOKUP_FAILED]', e.message);
    return { ok: false, error: e.message };
  }
  if (!sessionId) return { ok: false, error: 'session not found for PI' };

  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled', qr_code: null })
    .eq('stripe_session_id', sessionId)
    // Non sovrascrivere 'denied': se il locale ha già negato l'ingresso (e avviato
    // il refund), il successivo webhook charge.refunded non deve declassare a 'cancelled'.
    .neq('status', 'denied')
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[CANCEL_BOOKING_FAILED]', error);
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: true, noBooking: true };

  console.warn('[BOOKING_CANCELLED]', { bookingId: data.id, sessionId, reason });
  return { ok: true, bookingId: data.id };
}

// Re-export per compatibilità API
export { BOOKING_FEE };
