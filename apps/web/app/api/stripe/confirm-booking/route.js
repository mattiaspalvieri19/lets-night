import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { fulfillBookingFromSession } from '../../../../lib/fulfillBooking';

let _stripe;
function stripe() {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

// Conferma post-pagamento. Due chiamanti:
//  - app mobile: passa accessToken → verifichiamo che la sessione sia sua e
//    restituiamo il qrCode (lo mostra subito nella modal).
//  - pagina /payment-return (in-app browser, NON loggata): passa solo sessionId.
//    La session Stripe paid è già la prova: fulfilliamo lato server (idempotente,
//    il booking va a metadata.userId), ma NON restituiamo il qrCode a un chiamante
//    non autenticato (il QR è il biglietto d'ingresso → lo si vede solo in app).
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body non valido', code: 'BAD_BODY' }, { status: 400 });
  }
  const { sessionId, accessToken } = body || {};

  if (!sessionId || typeof sessionId !== 'string') {
    return NextResponse.json({ error: 'sessionId mancante', code: 'MISSING_PARAM' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  let session;
  try {
    session = await stripe().checkout.sessions.retrieve(sessionId);
  } catch (e) {
    console.error('Stripe retrieve session:', e);
    return NextResponse.json({ error: 'Sessione non trovata', code: 'SESSION_NOT_FOUND' }, { status: 404 });
  }

  // Token opzionale: se presente e coerente col proprietario → potremo restituire il QR.
  let owner = false;
  if (accessToken && typeof accessToken === 'string') {
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    if (user && session.metadata?.userId === user.id) owner = true;
    else if (user && session.metadata?.userId !== user.id) {
      // Token di un altro utente: non confermare la sessione altrui.
      return NextResponse.json({ error: 'Sessione non valida', code: 'SESSION_INVALID' }, { status: 403 });
    }
  }

  const result = await fulfillBookingFromSession(session, 'confirm_booking');
  if (!result.ok) {
    return NextResponse.json({
      error: result.error || 'Errore',
      code: result.code || null,
      refunded: !!result.refunded,
      oversold: !!result.oversold,
      duplicate: !!result.duplicate,
    }, { status: result.status || 500 });
  }

  return NextResponse.json({
    confirmed: true,
    bookingId: result.bookingId,
    qrCode: owner ? result.qrCode : undefined,
    alreadyExisted: !!result.alreadyExisted,
  });
}
