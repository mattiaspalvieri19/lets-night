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
    .select('id, qr_code')
    .eq('stripe_session_id', stripeSession.id)
    .maybeSingle();

  if (existing) {
    return { ok: true, bookingId: existing.id, qrCode: existing.qr_code, alreadyExisted: true };
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
    console.error('Insert booking fallita:', bookErr);
    return { error: 'Errore creazione prenotazione', status: 500 };
  }

  return { ok: true, bookingId: booking.id, qrCode: booking.qr_code };
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
