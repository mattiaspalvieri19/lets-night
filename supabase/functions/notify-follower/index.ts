import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const { follower_id, following_id } = await req.json();
    if (!follower_id || !following_id) {
      return new Response(JSON.stringify({ error: 'missing params' }), { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Nome del follower
    const { data: follower } = await supabase
      .from('profiles')
      .select('display_name, full_name')
      .eq('id', follower_id)
      .maybeSingle();

    // Token push dell'utente seguito
    const { data: target } = await supabase
      .from('profiles')
      .select('push_token')
      .eq('id', following_id)
      .maybeSingle();

    if (!target?.push_token) {
      return new Response(JSON.stringify({ sent: false, reason: 'no_token' }), { status: 200 });
    }

    const name = follower?.display_name || follower?.full_name || 'Qualcuno';

    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        to: target.push_token,
        title: "Nuovo follower",
        body: `${name} ha iniziato a seguirti`,
        data: { type: 'follow', follower_id },
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
