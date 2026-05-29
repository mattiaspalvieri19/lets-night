import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export function useSession() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!cancelled) { setSession(s); setLoading(false); }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!cancelled) { setSession(s); setLoading(false); }
    });
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

  return { session, loading };
}
