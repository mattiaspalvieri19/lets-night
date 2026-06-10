import { createClient } from '@supabase/supabase-js';

// Lazy proxy: ritarda createClient fino al primo accesso, così il build statico di Next.js
// (che valuta il modulo durante prerender) non crash se le env vars sono temporaneamente mancanti.
let _client = null;
function getClient() {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    // Build/prerender senza env → ritorna client innocuo. A runtime con env corrette funzionerà.
    _client = createClient('https://placeholder.supabase.co', 'placeholder-anon-key');
    return _client;
  }
  _client = createClient(url, key);
  return _client;
}

export const supabase = new Proxy({}, {
  get(_target, prop) {
    const c = getClient();
    const v = c[prop];
    return typeof v === 'function' ? v.bind(c) : v;
  },
});
