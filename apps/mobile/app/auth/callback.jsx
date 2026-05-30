import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../../lib/supabase';

export default function AuthCallback() {
  const { code, error: urlError, error_description } = useLocalSearchParams();
  const [status, setStatus] = useState('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function handle() {
      if (urlError) {
        setErrorMsg((error_description || '').replace(/\+/g, ' ') || 'Link non valido o scaduto.');
        setStatus('error');
        return;
      }
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setErrorMsg('Conferma non riuscita. Il link potrebbe essere scaduto o già usato.');
          setStatus('error');
          return;
        }
        setStatus('success');
        // Routing role-aware: business va in (business), user in (tabs)
        const userId = data?.session?.user?.id;
        if (userId) {
          const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).single();
          router.replace(profile?.role === 'business' ? '/(business)' : '/(tabs)');
        } else {
          router.replace('/(tabs)');
        }
      } else {
        setErrorMsg('Link di conferma non valido. Prova a registrarti di nuovo.');
        setStatus('error');
      }
    }
    handle();
  }, []);

  if (status === 'error') {
    return (
      <View style={{ flex: 1, backgroundColor: '#09090f', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>⚠️</Text>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 8 }}>
          Link non valido
        </Text>
        <Text style={{ color: '#64748B', textAlign: 'center', lineHeight: 22, marginBottom: 28 }}>
          {errorMsg}
        </Text>
        <Pressable
          onPress={() => router.replace('/auth/register')}
          style={{ backgroundColor: '#7C3AED', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12, width: '100%' }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15, textAlign: 'center' }}>Registrati di nuovo</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#09090f', justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator color="#A855F7" size="large" />
      <Text style={{ color: '#64748B', marginTop: 16, fontSize: 14 }}>Verifica in corso...</Text>
    </View>
  );
}
