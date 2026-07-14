import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logAudit } from '../../../../lib/auditLog';

// Validazione scanner lato server (service role). A differenza del client (vincolato dalla
// RLS, che NON gli fa leggere prenotazioni di altri locali), qui possiamo risolvere QUALSIASI
// QR per spiegare con precisione PERCHÉ non è valido — senza però restituire dati personali
// quando il locale non è autorizzato. La sicurezza resta: dati dell'ospite (nome/età/foto)
// SOLO se il QR appartiene a un evento di un locale dello scanner.
//
// Esiti possibili (campo `status`):
//   not_found        → QR inesistente
//   wrong_venue      → QR di un evento di un ALTRO locale (nessun dato personale)
//   cancelled        → prenotazione annullata
//   refunded         → ingresso negato/rimborsato
//   refunded_after_entry → annullata dopo che era già entrata (negare il rientro)
//   wrong_night      → locale giusto ma altra serata (con dati, per riconoscere l'ospite)
//   ok               → valido stasera (con tutti i dati per il check-in)

// "Oggi" nel fuso del locale (Milano-only → Europe/Rome): evita drift di un giorno a notte fonda.
function romeToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
}

// Giorni da event_date a today (today - event_date), su date pure YYYY-MM-DD.
function dayDelta(eventYmd, todayYmd) {
  const a = new Date(eventYmd + 'T00:00:00Z');
  const b = new Date(todayYmd + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

// Calcoliamo l'ETÀ lato server e mandiamo solo quella: minimizza il PII sul filo
// (il locale deve verificare l'età all'ingresso, non serve la data di nascita completa).
function calcAge(birthDate) {
  if (!birthDate) return null;
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age < 0 ? null : age;
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 });
  }
  const { qrCode, accessToken } = body || {};
  if (!qrCode || typeof qrCode !== 'string') {
    return NextResponse.json({ error: 'qrCode mancante' }, { status: 400 });
  }
  if (!accessToken || typeof accessToken !== 'string') {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser(accessToken);
  if (authErr || !user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
  }

  const { data: venues } = await supabase
    .from('venues')
    .select('id')
    .eq('owner_id', user.id);
  const myVenueIds = (venues || []).map(v => v.id);
  if (myVenueIds.length === 0) {
    return NextResponse.json({ status: 'no_venue' });
  }

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, status, checked_in, checked_in_at, quantity, total_price, booking_type, snapshot_full_name, user_id, events(title, event_date, event_time, venue_id, venues(name)), event_tables(people_count, max_people, collected, total_price, event_table_types(name)), event_ticket_types(name, drinks_included)')
    .eq('qr_code', qrCode)
    .maybeSingle();

  if (!booking) {
    await logAudit('scan_rejected', {
      severity: 'warn', actorId: user.id,
      message: 'Scan rifiutato: QR inesistente',
      details: { reason: 'not_found', qr: qrCode },
    });
    return NextResponse.json({ status: 'not_found' });
  }

  // Locale sbagliato → niente dati personali, solo l'esito.
  if (!myVenueIds.includes(booking.events?.venue_id)) {
    await logAudit('scan_rejected', {
      severity: 'warn', actorId: user.id, userId: booking.user_id,
      bookingId: booking.id, venueId: booking.events?.venue_id || null,
      message: 'Scan rifiutato: QR di un ALTRO locale (possibile tentativo di frode se ripetuto)',
      details: { reason: 'wrong_venue', scannerVenueIds: myVenueIds },
    });
    return NextResponse.json({ status: 'wrong_venue' });
  }

  if (booking.status === 'cancelled') {
    const reason = booking.checked_in ? 'refunded_after_entry' : 'cancelled';
    await logAudit('scan_rejected', {
      severity: 'warn', actorId: user.id, userId: booking.user_id,
      bookingId: booking.id, venueId: booking.events?.venue_id || null,
      message: reason === 'refunded_after_entry'
        ? 'Scan rifiutato: prenotazione annullata DOPO l\'ingresso (negare il rientro)'
        : 'Scan rifiutato: prenotazione annullata',
      details: { reason },
    });
    return NextResponse.json({ status: reason });
  }
  if (booking.status === 'denied') {
    await logAudit('scan_rejected', {
      severity: 'warn', actorId: user.id, userId: booking.user_id,
      bookingId: booking.id, venueId: booking.events?.venue_id || null,
      message: 'Scan rifiutato: ingresso già negato/rimborsato',
      details: { reason: 'refunded' },
    });
    return NextResponse.json({ status: 'refunded' });
  }

  // Profilo dell'ospite (foto + età): il locale è autorizzato (QR del suo evento).
  const { data: prof } = await supabase
    .from('profiles')
    .select('full_name, birth_date, avatar_url')
    .eq('id', booking.user_id)
    .maybeSingle();

  // Serata giusta? Valido stasera (delta 0) o nella grazia post-mezzanotte (delta 1,
  // evento iniziato ieri sera e finito dopo le 24). Futuro (delta<0) o passato (delta>1) → altra serata.
  let night = 'ok';
  const ed = booking.events?.event_date;
  if (ed) {
    const d = dayDelta(ed, romeToday());
    if (d < 0 || d > 1) night = 'wrong_night';
  }

  const payload = {
    bookingId: booking.id,
    name: booking.snapshot_full_name || prof?.full_name || 'Utente',
    age: calcAge(prof?.birth_date),
    avatarUrl: prof?.avatar_url || null,
    checkedIn: !!booking.checked_in,
    checkedInAt: booking.checked_in_at || null,
    bookingType: booking.booking_type || 'ticket',
    quantity: booking.quantity || 1,
    totalPrice: booking.total_price,
    event: {
      title: booking.events?.title || 'Evento',
      date: booking.events?.event_date || null,
      time: booking.events?.event_time || null,
    },
    table: booking.event_tables ? {
      typeName: booking.event_tables.event_table_types?.name || '',
      peopleCount: booking.event_tables.people_count,
      maxPeople: booking.event_tables.max_people,
      collected: booking.event_tables.collected,
      tableTotal: booking.event_tables.total_price,
    } : null,
    // Tipologia di ingresso: il buttafuori deve sapere COSA include (drink).
    ticketType: booking.event_ticket_types ? {
      name: booking.event_ticket_types.name,
      drinks: booking.event_ticket_types.drinks_included || 0,
    } : null,
  };

  if (night === 'wrong_night') {
    await logAudit('scan_rejected', {
      severity: 'warn', actorId: user.id, userId: booking.user_id,
      bookingId: booking.id, venueId: booking.events?.venue_id || null,
      message: 'Scan rifiutato: locale giusto ma ALTRA serata',
      details: { reason: 'wrong_night', eventDate: ed },
    });
  } else if (booking.checked_in) {
    // QR valido ripresentato dopo il check-in: rientro legittimo o QR copiato —
    // il registro rende visibili i pattern (stesso QR, orari, frequenza).
    await logAudit('scan_duplicate', {
      actorId: user.id, userId: booking.user_id,
      bookingId: booking.id, venueId: booking.events?.venue_id || null,
      message: 'QR già scannerizzato ripresentato (rientro o possibile copia)',
      details: { checkedInAt: booking.checked_in_at },
    });
  }
  // Scan valido "fresco": non si logga qui — il check-in che segue viene
  // registrato dal trigger (checkin_set), con l'attore giusto.

  return NextResponse.json({ status: night === 'wrong_night' ? 'wrong_night' : 'ok', booking: payload });
}
