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

// L'app mobile passa il proprio base URL (ricavato dall'host di Expo) così il success_url
// di Stripe è SEMPRE raggiungibile dal telefono, anche quando l'IP della rete cambia.
// Per sicurezza accettiamo solo host privati/localhost (dev): in produzione il base
// non-privato viene scartato e si usa NEXT_PUBLIC_SITE_URL.
function safeReturnBase(v) {
  if (!v || typeof v !== 'string') return null;
  try {
    const u = new URL(v);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const h = u.hostname;
    const isPrivate =
      h === 'localhost' || h === '127.0.0.1' ||
      /^10\./.test(h) || /^192\.168\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h);
    return isPrivate ? `${u.protocol}//${u.host}` : null;
  } catch {
    return null;
  }
}

// Una sola prenotazione ATTIVA per evento, qualunque tipo: blocca ingresso se hai già un
// tavolo (e viceversa). La verità atomica è l'indice UNIQUE (user_id, event_id) sul DB;
// questo è il blocco UX PRIMA del pagamento.
async function hasActiveBooking(supabase, userId, eventId) {
  const { data } = await supabase
    .from('bookings')
    .select('id')
    .eq('user_id', userId)
    .eq('event_id', eventId)
    .not('status', 'in', '("cancelled","denied")')
    .limit(1);
  return !!(data && data.length);
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body non valido', code: 'BAD_BODY' }, { status: 400 });
  }

  const { eventId, quantity, bookingType, ticketTypeId, accessToken, tableAction, typeId, tableId, visibility, share, returnBase } = body || {};

  if (!accessToken || typeof accessToken !== 'string') {
    return NextResponse.json({ error: 'Non autenticato', code: 'UNAUTHENTICATED' }, { status: 401 });
  }
  if (!eventId || typeof eventId !== 'string') {
    return NextResponse.json({ error: 'eventId mancante', code: 'MISSING_PARAM' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !user) {
    return NextResponse.json({ error: 'Non autenticato', code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const { data: event, error: evError } = await supabase
    .from('events')
    .select('id, price, table_price, has_tables, title, event_date, is_active, capacity, booked_count')
    .eq('id', eventId)
    .eq('is_active', true)
    .maybeSingle();

  if (evError || !event) {
    return NextResponse.json({ error: 'Evento non trovato', code: 'EVENT_NOT_FOUND' }, { status: 404 });
  }

  if (event.event_date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [y, m, d] = event.event_date.split('-').map(Number);
    if (new Date(y, m - 1, d) < today) {
      return NextResponse.json({ error: 'Evento passato', code: 'EVENT_PAST' }, { status: 400 });
    }
  }

  const base = safeReturnBase(returnBase) || siteUrl();
  const successUrl = `${base}/payment-return?status=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${base}/payment-return?status=cancel`;

  // ============================ RAMO TAVOLI ============================
  // open: apre un tavolo di una tipologia (public/private) pagando la propria quota.
  // join: si unisce a un tavolo esistente con una quota libera (>= min, <= residuo).
  // I check qui sono PRE-validazioni UX: la verità atomica sono i trigger DB al
  // fulfillment (TABLES_FULL / TABLE_SEATS_FULL / SHARE_EXCEEDS_REMAINING) con auto-refund.
  if (tableAction === 'open' || tableAction === 'join') {
    const shareNum = Number(share);
    if (!Number.isFinite(shareNum) || shareNum < TABLE_MIN_SHARE) {
      return NextResponse.json({ error: `Quota minima ${TABLE_MIN_SHARE} €`, code: 'SHARE_TOO_LOW' }, { status: 400 });
    }

    // Una prenotazione per evento: se hai già un ingresso (o un altro tavolo) per questo evento, blocca.
    if (await hasActiveBooking(supabase, user.id, eventId)) {
      return NextResponse.json({ error: 'Hai già una prenotazione per questo evento (ingresso o tavolo).', code: 'ALREADY_BOOKED', duplicate: true }, { status: 409 });
    }

    let typeName;
    let metadata;

    if (tableAction === 'open') {
      if (!typeId || typeof typeId !== 'string') {
        return NextResponse.json({ error: 'typeId mancante', code: 'MISSING_PARAM' }, { status: 400 });
      }
      const vis = visibility === 'private' ? 'private' : 'public';
      const { data: type } = await supabase
        .from('event_table_types')
        .select('id, event_id, name, total_price, max_people, tables_count')
        .eq('id', typeId)
        .eq('event_id', eventId)
        .maybeSingle();
      if (!type) {
        return NextResponse.json({ error: 'Tipologia tavolo non trovata', code: 'TYPE_NOT_FOUND' }, { status: 404 });
      }
      if (shareNum > Number(type.total_price)) {
        return NextResponse.json({ error: 'La quota supera il prezzo del tavolo', code: 'SHARE_EXCEEDS' }, { status: 400 });
      }
      const { count: openCount } = await supabase
        .from('event_tables')
        .select('*', { count: 'exact', head: true })
        .eq('type_id', typeId)
        .neq('status', 'cancelled');
      if ((openCount || 0) >= type.tables_count) {
        return NextResponse.json({ error: 'Tavoli esauriti per questa tipologia', code: 'TABLES_FULL' }, { status: 409 });
      }
      typeName = type.name;

      metadata = {
        kind: 'table', tableAction: 'open',
        eventId: event.id, userId: user.id,
        typeId, visibility: vis, share: String(shareNum),
      };
    } else {
      if (!tableId || typeof tableId !== 'string') {
        return NextResponse.json({ error: 'tableId mancante', code: 'MISSING_PARAM' }, { status: 400 });
      }
      const { data: table } = await supabase
        .from('event_tables')
        .select('id, event_id, status, total_price, max_people, type_id, event_table_types(name)')
        .eq('id', tableId)
        .eq('event_id', eventId)
        .maybeSingle();
      if (!table) {
        return NextResponse.json({ error: 'Tavolo non trovato', code: 'TABLE_NOT_FOUND' }, { status: 404 });
      }
      if (table.status !== 'open') {
        return NextResponse.json({ error: 'Questo tavolo è già al completo', code: 'TABLE_FULL' }, { status: 409 });
      }
      const { data: members } = await supabase
        .from('bookings')
        .select('user_id, total_price, status')
        .eq('table_id', tableId)
        .not('status', 'in', '("cancelled","denied")');
      const list = members || [];
      if (list.some(m => m.user_id === user.id)) {
        return NextResponse.json({ error: 'Fai già parte di questo tavolo.', code: 'ALREADY_MEMBER', duplicate: true }, { status: 409 });
      }
      if (list.length >= table.max_people) {
        return NextResponse.json({ error: 'Tavolo al completo', code: 'TABLE_FULL' }, { status: 409 });
      }
      const paid = list.reduce((s, m) => s + Number(m.total_price || 0), 0);
      const remaining = Number(table.total_price) - paid;
      if (shareNum > remaining) {
        return NextResponse.json({ error: `Restano ${remaining.toFixed(2)} € da coprire: la quota non può superarli`, code: 'SHARE_EXCEEDS_REMAINING' }, { status: 400 });
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
      return NextResponse.json({ error: 'Servizio pagamenti non disponibile', code: 'PAYMENTS_DOWN' }, { status: 502 });
    }

    return NextResponse.json({ url: session.url, sessionId: session.id });
  }

  // ============================ RAMO BIGLIETTI ============================
  // Una prenotazione per evento: blocca PRIMA di addebitare se l'utente ha già un ingresso
  // O un tavolo per questo evento. Senza, Stripe incasserebbe e fulfillBooking catcherebbe il
  // 23505 nel DB lasciando un pagamento orfano (poi rimborsato).
  if (await hasActiveBooking(supabase, user.id, eventId)) {
    return NextResponse.json({ error: 'Hai già una prenotazione per questo evento (ingresso o tavolo).', code: 'ALREADY_BOOKED', duplicate: true }, { status: 409 });
  }

  // Tipologie di ingresso: se l'evento ne ha di ATTIVE, la scelta è obbligatoria.
  // Con ticketTypeId il booking è per definizione un biglietto (mai tavolo flat).
  let ticketType = null;
  if (ticketTypeId && typeof ticketTypeId === 'string') {
    const { data: tt } = await supabase
      .from('event_ticket_types')
      .select('id, event_id, name, price, drinks_included, quantity, is_active')
      .eq('id', ticketTypeId)
      .eq('event_id', eventId)
      .maybeSingle();
    if (!tt) {
      return NextResponse.json({ error: 'Tipologia di ingresso non trovata', code: 'TICKET_TYPE_NOT_FOUND' }, { status: 404 });
    }
    if (!tt.is_active) {
      return NextResponse.json({ error: 'Tipologia di ingresso non più disponibile', code: 'TICKET_TYPE_INACTIVE' }, { status: 409 });
    }
    ticketType = tt;
  } else {
    const { count: activeTypes } = await supabase
      .from('event_ticket_types')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('is_active', true);
    if ((activeTypes || 0) > 0) {
      return NextResponse.json({ error: 'Seleziona una tipologia di ingresso', code: 'TICKET_TYPE_REQUIRED' }, { status: 400 });
    }
  }

  const pricing = computeBookingPrice(event, ticketType ? 'ticket' : bookingType, quantity, ticketType);

  if (pricing.isFree) {
    return NextResponse.json({ error: 'Evento gratuito: usa il flusso diretto', code: 'FREE_EVENT_DIRECT' }, { status: 400 });
  }

  if (event.capacity != null && (event.booked_count || 0) + pricing.safeQty > event.capacity) {
    return NextResponse.json({ error: 'Capienza esaurita', code: 'CAPACITY_FULL' }, { status: 409 });
  }

  // Disponibilità per-tipologia (somma delle QUANTITÀ, non conteggio righe).
  // Pre-check UX: la verità atomica è il trigger enforce_ticket_type_capacity.
  if (ticketType && ticketType.quantity != null) {
    const { data: sold } = await supabase
      .from('bookings')
      .select('quantity')
      .eq('ticket_type_id', ticketType.id)
      .not('status', 'in', '("cancelled","denied")');
    const taken = (sold || []).reduce((s, b) => s + (Number(b.quantity) || 1), 0);
    if (taken + pricing.safeQty > ticketType.quantity) {
      return NextResponse.json({ error: 'Tipologia di ingresso esaurita', code: 'TICKET_TYPE_FULL' }, { status: 409 });
    }
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
            product_data: { name: `${event.title} — ${ticketType ? ticketType.name : (pricing.bookingType === 'table' ? 'Tavolo' : 'Ingresso')}` },
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
        ...(ticketType ? { ticketTypeId: ticketType.id } : {}),
      },
    });
  } catch (e) {
    console.error('Stripe checkout.sessions.create:', e);
    return NextResponse.json({ error: 'Servizio pagamenti non disponibile', code: 'PAYMENTS_DOWN' }, { status: 502 });
  }

  return NextResponse.json({ url: session.url, sessionId: session.id });
}
