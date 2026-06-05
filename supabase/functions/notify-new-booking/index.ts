import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const { event_id, user_id } = await req.json();
    if (!event_id || !user_id) {
      return new Response(JSON.stringify({ error: 'missing params' }), { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Dati evento + venue owner
    const { data: ev } = await supabase
      .from('events')
      .select('title, venues(owner_id, name)')
      .eq('id', event_id)
      .maybeSingle();

    if (!ev?.venues?.owner_id) {
      return new Response(JSON.stringify({ sent: false, reason: 'no_owner' }), { status: 200 });
    }

    // Nome utente che ha prenotato
    const { data: booker } = await supabase
      .from('profiles')
      .select('display_name, full_name')
      .eq('id', user_id)
      .maybeSingle();

    // Token push dell'owner del locale
    const { data: owner } = await supabase
      .from('profiles')
      .select('push_token')
      .eq('id', ev.venues.owner_id)
      .maybeSingle();

    if (!owner?.push_token) {
      return new Response(JSON.stringify({ sent: false, reason: 'no_token' }), { status: 200 });
    }

    const bookerName = booker?.display_name || booker?.full_name || 'Qualcuno';

    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        to: owner.push_token,
        title: "Nuova prenotazione",
        body: `${bookerName} ha prenotato ${ev.title}`,
        data: { type: 'booking', event_id },
      }),
    });

    const result = await res.json();
    return new Response(JSON.stringify({ sent: true, result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
