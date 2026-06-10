import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { fulfillBookingFromSession } from '../../../../lib/fulfillBooking';

let _stripe;
function stripe() {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

// Chiamato dal client dopo il redirect /payment-return per mostrare subito il QR.
// Il webhook è la fonte di verità — questa route è un fallback sincrono.
// Tutta la logica è idempotente: stesse session può essere richiesta N volte.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 });
  }
  const { sessionId, accessToken } = body || {};

  if (!sessionId || typeof sessionId !== 'string') {
    return NextResponse.json({ error: 'sessionId mancante' }, { status: 400 });
  }
  if (!accessToken || typeof accessToken !== 'string') {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
  }

  let session;
  try {
    session = await stripe().checkout.sessions.retrieve(sessionId);
  } catch (e) {
    console.error('Stripe retrieve session:', e);
    return NextResponse.json({ error: 'Sessione non trovata' }, { status: 404 });
  }

  if (session.metadata?.userId !== user.id) {
    return NextResponse.json({ error: 'Sessione non valida' }, { status: 403 });
  }

  const result = await fulfillBookingFromSession(session);
  if (!result.ok) {
    return NextResponse.json({
      error: result.error || 'Errore',
      refunded: !!result.refunded,
      oversold: !!result.oversold,
      duplicate: !!result.duplicate,
    }, { status: result.status || 500 });
  }

  return NextResponse.json({
    bookingId: result.bookingId,
    qrCode: result.qrCode,
    alreadyExisted: !!result.alreadyExisted,
  });
}
