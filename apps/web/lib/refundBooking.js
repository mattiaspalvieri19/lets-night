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
        });
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
