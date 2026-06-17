import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requestNoShowRefund } from '../../../../lib/refundBooking';

// L'utente richiede il rimborso "no-show". L'eleggibilità (propria prenotazione,
// a pagamento, non entrato, dopo la fine serata) è verificata dentro la lib.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 });
  }
  const { bookingId, accessToken } = body || {};

  if (!accessToken || typeof accessToken !== 'string') {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
  }
  if (!bookingId || typeof bookingId !== 'string') {
    return NextResponse.json({ error: 'bookingId mancante' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
  }

  const result = await requestNoShowRefund({ bookingId, callerUserId: user.id });
  if (!result.ok) {
    return NextResponse.json({ error: result.error || 'Errore' }, { status: result.status || 500 });
  }
  return NextResponse.json({ ok: true, alreadyRequested: !!result.alreadyRequested });
}
