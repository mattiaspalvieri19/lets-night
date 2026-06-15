import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Invocata da un Database Webhook su INSERT in `notifications`. Manda il push remoto SOLO
// per i tipi che non hanno già un altro canale: 'follow' lo gestisce notify-follower,
// 'booking_confirmed' ha la notifica LOCALE immediata → li saltiamo per non duplicare.
const PUSH_TYPES = new Set(['friend_booking', 'reminder', 'generic']);

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const n = payload?.record;
    if (!n || !n.user_id || !PUSH_TYPES.has(n.type)) {
      return new Response(JSON.stringify({ skipped: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: prof } = await supabase
      .from('profiles')
      .select('push_token')
      .eq('id', n.user_id)
      .maybeSingle();

    if (!prof?.push_token) {
      return new Response(JSON.stringify({ sent: false, reason: 'no_token' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        to: prof.push_token,
        title: n.title,
        body: n.body || '',
        sound: 'default',
        // data per il deep-link al tap (vedi handler in app/_layout.jsx)
        data: { type: n.type, event_id: n.event_id, booking_id: n.booking_id, actor_id: n.actor_id, follower_id: n.actor_id },
      }),
    });
    const result = await res.json();
    return new Response(JSON.stringify({ sent: true, result }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
