import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';

export default function TicketsScreen() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#09090f', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#A855F7" />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={{ flex: 1, backgroundColor: '#09090f', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
        <Text style={{ fontSize: 44, marginBottom: 16 }}>🎟️</Text>
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: -0.5, textAlign: 'center', marginBottom: 8 }}>
          I tuoi biglietti
        </Text>
        <Text style={{ color: '#64748B', fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 32 }}>
          Accedi per vedere le tue prenotazioni e i biglietti degli eventi.
        </Text>
        <Pressable
          onPress={() => router.push('/auth/login')}
          style={({ pressed }) => ({
            backgroundColor: '#7C3AED',
            paddingHorizontal: 32,
            paddingVertical: 14,
            borderRadius: 10,
            width: '100%',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15, textAlign: 'center' }}>Accedi</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/auth/register')}
          style={({ pressed }) => ({
            marginTop: 12,
            paddingVertical: 14,
            width: '100%',
            borderWidth: 1.5,
            borderColor: 'rgba(168,85,247,0.3)',
            borderRadius: 10,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: '#A855F7', fontWeight: '600', fontSize: 14, textAlign: 'center' }}>
            Registrati gratis
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#09090f' }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(168,85,247,0.12)' }}>
        <Text style={{ color: '#A855F7', fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 5 }}>
          I tuoi acquisti
        </Text>
        <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900', letterSpacing: -0.5 }}>
          Biglietti
        </Text>
      </View>

      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>🎟️</Text>
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' }}>
          Nessuna prenotazione
        </Text>
        <Text style={{ color: '#64748B', fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 28 }}>
          Prenota il tuo primo evento e lo troverai qui.
        </Text>
        <Pressable
          onPress={() => router.push('/(tabs)')}
          style={({ pressed }) => ({
            backgroundColor: '#7C3AED',
            paddingHorizontal: 28,
            paddingVertical: 12,
            borderRadius: 10,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Scopri eventi</Text>
        </Pressable>
      </View>
    </View>
  );
}
