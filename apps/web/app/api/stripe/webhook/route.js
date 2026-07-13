import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { fulfillBookingFromSession, cancelBookingByPaymentIntent } from '../../../../lib/fulfillBooking';
import { logAudit } from '../../../../lib/auditLog';

let _stripe;
function stripe() {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

// Stripe webhook: fonte di verità. Funziona anche se l'utente chiude il browser dopo pagamento.
// Gestisce anche refund/chargeback per impedire frode "paga → entra → chiama Stripe per chargeback → gratis".
export async function POST(request) {
  const sig = request.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !secret) {
    return NextResponse.json({ error: 'Webhook non configurato' }, { status: 400 });
  }

  const raw = await request.text();
  let event;
  try {
    event = stripe().webhooks.constructEvent(raw, sig, secret);
  } catch (e) {
    console.error('Stripe webhook signature invalid:', e.message);
    return NextResponse.json({ error: 'Signature invalid' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object;
        const result = await fulfillBookingFromSession(session, 'webhook');
        // 2xx evita retry per anomalie applicative (oversold, price mismatch — già rimborsate dentro fulfill).
        // Solo errori transient (500) forzano retry Stripe.
        if (result.error && result.status === 500) {
          return NextResponse.json({ received: true, error: result.error }, { status: 500 });
        }
        break;
      }

      case 'charge.refunded': {
        // Un refund parziale o totale è arrivato. Cancella il booking corrispondente per invalidare il QR.
        const charge = event.data.object;
        if (charge.payment_intent) {
          const res = await cancelBookingByPaymentIntent(charge.payment_intent, `refund:${charge.id}`);
          // Registra solo se ha davvero toccato una prenotazione (i rimborsi che
          // partono da noi arrivano qui come eco: la booking è già cancelled/denied).
          if (res?.bookingId) {
            await logAudit('webhook_event', {
              bookingId: res.bookingId,
              message: 'Refund da Stripe → prenotazione annullata e QR invalidato',
              details: { stripeType: event.type, stripeEventId: event.id, chargeId: charge.id },
            });
          }
        }
        break;
      }

      case 'charge.dispute.created': {
        // Chargeback aperto: invalida QR per impedire ingresso post-dispute.
        const dispute = event.data.object;
        if (dispute.payment_intent) {
          const res = await cancelBookingByPaymentIntent(dispute.payment_intent, `dispute:${dispute.id}`);
          await logAudit('chargeback', {
            severity: 'error',
            bookingId: res?.bookingId || null,
            message: 'CHARGEBACK aperto dal titolare carta → QR invalidato',
            details: {
              stripeEventId: event.id, disputeId: dispute.id,
              amountCents: dispute.amount, reason: dispute.reason,
              bookingFound: !!res?.bookingId,
            },
          });
        }
        break;
      }

      default:
        // Eventi non gestiti: ack silenzioso (Stripe richiede 2xx per non riprovare).
        break;
    }
  } catch (e) {
    console.error('Webhook handler error:', e);
    // Errori interni transient → 500 → Stripe ritenta.
    return NextResponse.json({ received: true, error: 'internal' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
