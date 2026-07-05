import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ADMIN: dati auth di un utente (email, registrazione, ultimo accesso).
// auth.users non è esponibile via RLS → passa dal service role, con check
// esplicito sulla tabella admins (stesso schema di /api/refund/resolve).
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 });
  }
  const { userId, accessToken } = body || {};

  if (!accessToken || typeof accessToken !== 'string') {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
  }
  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'userId mancante' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
  }

  const { data: adminRow } = await supabase
    .from('admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!adminRow) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 });
  }

  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data?.user) {
    return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 });
  }

  return NextResponse.json({
    email: data.user.email,
    created_at: data.user.created_at,
    last_sign_in_at: data.user.last_sign_in_at,
    email_confirmed_at: data.user.email_confirmed_at,
  });
}
