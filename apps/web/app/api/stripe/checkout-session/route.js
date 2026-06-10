import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { computeBookingPrice } from '@lets-night/shared';

let _stripe;
function stripe() {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 });
  }

  const { eventId, quantity, bookingType, accessToken } = body || {};

  if (!accessToken || typeof accessToken !== 'string') {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
  }
  if (!eventId || typeof eventId !== 'string') {
    return NextResponse.json({ error: 'eventId mancante' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
  }

  const { data: event, error: evError } = await supabase
    .from('events')
    .select('id, price, table_price, has_tables, title, event_date, is_active, capacity, booked_count')
    .eq('id', eventId)
    .eq('is_active', true)
    .maybeSingle();

  if (evError || !event) {
    return NextResponse.json({ error: 'Evento non trovato' }, { status: 404 });
  }

  // Blocco preventivo doppio booking: se l'utente ha già una prenotazione attiva per questo evento,
  // rifiutiamo PRIMA di addebitarlo. Senza questo check Stripe incasserebbe e poi fulfillBooking
  // catcherebbe il 23505 nel DB, lasciando l'utente con un pagamento orfano.
  const { data: existingBooking } = await supabase
    .from('bookings')
    .select('id')
    .eq('user_id', user.id)
    .eq('event_id', eventId)
    .neq('status', 'cancelled')
    .maybeSingle();

  if (existingBooking) {
    return NextResponse.json({ error: 'Hai già prenotato questo evento.', duplicate: true }, { status: 409 });
  }

  if (event.event_date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [y, m, d] = event.event_date.split('-').map(Number);
    if (new Date(y, m - 1, d) < today) {
      return NextResponse.json({ error: 'Evento passato' }, { status: 400 });
    }
  }

  const pricing = computeBookingPrice(event, bookingType, quantity);

  if (pricing.isFree) {
    return NextResponse.json({ error: 'Evento gratuito: usa il flusso diretto' }, { status: 400 });
  }

  if (event.capacity != null && (event.booked_count || 0) + pricing.safeQty > event.capacity) {
    return NextResponse.json({ error: 'Capienza esaurita' }, { status: 409 });
  }

  const successUrl = `${siteUrl()}/payment-return?status=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${siteUrl()}/payment-return?status=cancel`;

  let session;
  try {
    session = await stripe().checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: { name: `${event.title} — ${pricing.bookingType === 'table' ? 'Tavolo' : 'Ingresso'}` },
            unit_amount: Math.round(pricing.effectivePrice * 100),
          },
          quantity: pricing.safeQty,
        },
        {
          price_data: {
            currency: 'eur',
            product_data: { name: 'Booking fee' },
            unit_amount: Math.round(pricing.fee * 100),
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        eventId: event.id,
        userId: user.id,
        quantity: String(pricing.safeQty),
        bookingType: pricing.bookingType,
      },
    });
  } catch (e) {
    console.error('Stripe checkout.sessions.create:', e);
    return NextResponse.json({ error: 'Servizio pagamenti non disponibile' }, { status: 502 });
  }

  return NextResponse.json({ url: session.url, sessionId: session.id });
}
