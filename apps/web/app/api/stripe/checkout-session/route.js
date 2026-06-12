import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { computeBookingPrice, BOOKING_FEE, TABLE_MIN_SHARE } from '@lets-night/shared';

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

  const { eventId, quantity, bookingType, accessToken, tableAction, typeId, tableId, visibility, share } = body || {};

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

  if (event.event_date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [y, m, d] = event.event_date.split('-').map(Number);
    if (new Date(y, m - 1, d) < today) {
      return NextResponse.json({ error: 'Evento passato' }, { status: 400 });
    }
  }

  const successUrl = `${siteUrl()}/payment-return?status=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${siteUrl()}/payment-return?status=cancel`;

  // ============================ RAMO TAVOLI ============================
  // open: apre un tavolo di una tipologia (public/private) pagando la propria quota.
  // join: si unisce a un tavolo esistente con una quota libera (>= min, <= residuo).
  // I check qui sono PRE-validazioni UX: la verità atomica sono i trigger DB al
  // fulfillment (TABLES_FULL / TABLE_SEATS_FULL / SHARE_EXCEEDS_REMAINING) con auto-refund.
  if (tableAction === 'open' || tableAction === 'join') {
    const shareNum = Number(share);
    if (!Number.isFinite(shareNum) || shareNum < TABLE_MIN_SHARE) {
      return NextResponse.json({ error: `Quota minima ${TABLE_MIN_SHARE} €` }, { status: 400 });
    }

    let typeName;
    let metadata;

    if (tableAction === 'open') {
      if (!typeId || typeof typeId !== 'string') {
        return NextResponse.json({ error: 'typeId mancante' }, { status: 400 });
      }
      const vis = visibility === 'private' ? 'private' : 'public';
      const { data: type } = await supabase
        .from('event_table_types')
        .select('id, event_id, name, total_price, max_people, tables_count')
        .eq('id', typeId)
        .eq('event_id', eventId)
        .maybeSingle();
      if (!type) {
        return NextResponse.json({ error: 'Tipologia tavolo non trovata' }, { status: 404 });
      }
      if (shareNum > Number(type.total_price)) {
        return NextResponse.json({ error: 'La quota supera il prezzo del tavolo' }, { status: 400 });
      }
      const { count: openCount } = await supabase
        .from('event_tables')
        .select('*', { count: 'exact', head: true })
        .eq('type_id', typeId)
        .neq('status', 'cancelled');
      if ((openCount || 0) >= type.tables_count) {
        return NextResponse.json({ error: 'Tavoli esauriti per questa tipologia' }, { status: 409 });
      }
      typeName = type.name;

      metadata = {
        kind: 'table', tableAction: 'open',
        eventId: event.id, userId: user.id,
        typeId, visibility: vis, share: String(shareNum),
      };
    } else {
      if (!tableId || typeof tableId !== 'string') {
        return NextResponse.json({ error: 'tableId mancante' }, { status: 400 });
      }
      const { data: table } = await supabase
        .from('event_tables')
        .select('id, event_id, status, total_price, max_people, type_id, event_table_types(name)')
        .eq('id', tableId)
        .eq('event_id', eventId)
        .maybeSingle();
      if (!table) {
        return NextResponse.json({ error: 'Tavolo non trovato' }, { status: 404 });
      }
      if (table.status !== 'open') {
        return NextResponse.json({ error: 'Questo tavolo è già al completo' }, { status: 409 });
      }
      const { data: members } = await supabase
        .from('bookings')
        .select('user_id, total_price, status')
        .eq('table_id', tableId)
        .not('status', 'in', '("cancelled","denied")');
      const list = members || [];
      if (list.some(m => m.user_id === user.id)) {
        return NextResponse.json({ error: 'Fai già parte di questo tavolo.', duplicate: true }, { status: 409 });
      }
      if (list.length >= table.max_people) {
        return NextResponse.json({ error: 'Tavolo al completo' }, { status: 409 });
      }
      const paid = list.reduce((s, m) => s + Number(m.total_price || 0), 0);
      const remaining = Number(table.total_price) - paid;
      if (shareNum > remaining) {
        return NextResponse.json({ error: `Restano ${remaining.toFixed(2)} € da coprire: la quota non può superarli` }, { status: 400 });
      }
      typeName = table.event_table_types?.name || 'Tavolo';

      metadata = {
        kind: 'table', tableAction: 'join',
        eventId: event.id, userId: user.id,
        tableId, share: String(shareNum),
      };
    }

    let session;
    try {
      session = await stripe().checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'eur',
              product_data: { name: `${event.title} — Tavolo ${typeName} (quota)` },
              unit_amount: Math.round(shareNum * 100),
            },
            quantity: 1,
          },
          {
            price_data: {
              currency: 'eur',
              product_data: { name: 'Booking fee' },
              unit_amount: Math.round(BOOKING_FEE * 100),
            },
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata,
      });
    } catch (e) {
      console.error('Stripe checkout.sessions.create (table):', e);
      return NextResponse.json({ error: 'Servizio pagamenti non disponibile' }, { status: 502 });
    }

    return NextResponse.json({ url: session.url, sessionId: session.id });
  }

  // ============================ RAMO BIGLIETTI ============================
  // Blocco preventivo doppio booking: se l'utente ha già una prenotazione attiva per questo evento,
  // rifiutiamo PRIMA di addebitarlo. Senza questo check Stripe incasserebbe e poi fulfillBooking
  // catcherebbe il 23505 nel DB, lasciando l'utente con un pagamento orfano.
  const { data: existingBooking } = await supabase
    .from('bookings')
    .select('id')
    .eq('user_id', user.id)
    .eq('event_id', eventId)
    .is('table_id', null)
    .neq('status', 'cancelled')
    .maybeSingle();

  if (existingBooking) {
    return NextResponse.json({ error: 'Hai già prenotato questo evento.', duplicate: true }, { status: 409 });
  }

  const pricing = computeBookingPrice(event, bookingType, quantity);

  if (pricing.isFree) {
    return NextResponse.json({ error: 'Evento gratuito: usa il flusso diretto' }, { status: 400 });
  }

  if (event.capacity != null && (event.booked_count || 0) + pricing.safeQty > event.capacity) {
    return NextResponse.json({ error: 'Capienza esaurita' }, { status: 409 });
  }

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
