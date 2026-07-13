import { createClient } from '@supabase/supabase-js';

// Registro (audit_logs): scrittura server-side dei fatti soldi+frode.
// FIRE-AND-FORGET: il diario non deve MAI rompere il flusso chiamante — ogni
// errore (inclusa la tabella non ancora creata, se la migration non è applicata)
// viene inghiottito. supabase-js non lancia sugli errori di insert; il try/catch
// copre i guasti di rete/config.
export async function logAudit(type, {
  severity = 'info',
  actorId = null,
  userId = null,
  bookingId = null,
  eventId = null,
  venueId = null,
  message = null,
  details = null,
} = {}) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    await supabase.from('audit_logs').insert({
      type,
      severity,
      actor_id: actorId,
      user_id: userId,
      booking_id: bookingId,
      event_id: eventId,
      venue_id: venueId,
      message,
      details,
    });
  } catch {}
}
