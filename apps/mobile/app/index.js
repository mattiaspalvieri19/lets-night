import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { supabase } from '../lib/supabase';

// Smistamento all'avvio: admin → area admin, business → dashboard locale,
// altrimenti tabs utente. Senza questo, un business riapriva l'app nelle tabs
// utente e doveva rifare login per tornare alla dashboard.
export default function Index() {
  const [target, setTarget] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) {
          const { data: adminRow } = await supabase
            .from('admins')
            .select('user_id')
            .eq('user_id', session.user.id)
            .maybeSingle();
          if (adminRow) { setTarget('/(admin)'); return; }
          const { data: p } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .maybeSingle();
          if (p?.role === 'business') { setTarget('/(business)'); return; }
        }
      } catch {}
      setTarget('/(tabs)');
    })();
  }, []);

  if (!target) return <View style={{ flex: 1, backgroundColor: '#0A0A0C' }} />;
  return <Redirect href={target} />;
}
