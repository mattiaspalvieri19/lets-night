import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';

export default function BusinessProfile() {
  const [loading, setLoading] = useState(true);
  const [venue, setVenue] = useState(null);
  const [user, setUser] = useState(null);

  useFocusEffect(useCallback(() => {
    async function load() {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/auth/login'); return; }
      setUser(session.user);
      const { data: v } = await supabase.from('venues').select('*').eq('owner_id', session.user.id).maybeSingle();
      setVenue(v);
      setLoading(false);
    }
    load();
  }, []));

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/auth/login');
  }

  if (loading) return <View style={{ flex: 1, backgroundColor: '#09090f', justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color="#A855F7" size="large" /></View>;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#09090f' }} showsVerticalScrollIndicator={false}>
      <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 24 }}>
        <Text style={{ color: '#A855F7', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>Il tuo locale</Text>
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900' }}>{venue?.name || 'Locale'}</Text>
      </View>

      {/* Stato verifica */}
      <View style={{ marginHorizontal: 20, marginBottom: 20, backgroundColor: venue?.is_verified ? 'rgba(74,222,128,0.1)' : 'rgba(245,158,11,0.1)', borderWidth: 1, borderColor: venue?.is_verified ? 'rgba(74,222,128,0.3)' : 'rgba(245,158,11,0.3)', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={{ fontSize: 24 }}>{venue?.is_verified ? '✅' : '⏳'}</Text>
        <View>
          <Text style={{ color: venue?.is_verified ? '#4ADE80' : '#FBBF24', fontWeight: '700', fontSize: 14 }}>
            {venue?.is_verified ? 'Locale verificato' : 'In attesa di approvazione'}
          </Text>
          <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>
            {venue?.is_verified ? 'Il tuo locale è pubblico su Let\'s Night' : 'Il team ti contatterà entro 24-48 ore'}
          </Text>
        </View>
      </View>

      {/* Dati locale */}
      <View style={{ marginHorizontal: 20, marginBottom: 12, backgroundColor: '#111118', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(168,85,247,0.12)' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Dati locale</Text>
          <Pressable onPress={() => router.push('/(business)/venue/edit')} hitSlop={6}>
            <Text style={{ color: '#A855F7', fontWeight: '700', fontSize: 13 }}>Modifica</Text>
          </Pressable>
        </View>
        {[
          ['Categoria', venue?.category],
          ['Città', venue?.city],
          ['Zona', venue?.zona],
          ['Indirizzo', venue?.address],
          ['Telefono', venue?.phone],
        ].filter(([, v]) => v).map(([label, value]) => (
          <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(168,85,247,0.07)' }}>
            <Text style={{ color: '#64748B', fontSize: 13 }}>{label}</Text>
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '500', maxWidth: '60%', textAlign: 'right' }}>{value}</Text>
          </View>
        ))}
      </View>

      <Pressable
        onPress={() => router.push('/(business)/venue/edit')}
        style={({ pressed }) => ({ marginHorizontal: 20, marginBottom: 20, backgroundColor: '#7C3AED', borderRadius: 14, paddingVertical: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, opacity: pressed ? 0.85 : 1 })}
      >
        <Text style={{ fontSize: 16 }}>✏️</Text>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Modifica locale</Text>
      </Pressable>

      {/* Dati account */}
      <View style={{ marginHorizontal: 20, marginBottom: 32, backgroundColor: '#111118', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(168,85,247,0.12)' }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15, marginBottom: 14 }}>Account</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
          <Text style={{ color: '#64748B', fontSize: 13 }}>Email</Text>
          <Text style={{ color: '#fff', fontSize: 12, maxWidth: '65%', textAlign: 'right' }}>{user?.email}</Text>
        </View>
      </View>

      {/* Dashboard web */}
      <View style={{ marginHorizontal: 20, marginBottom: 16, backgroundColor: 'rgba(124,58,237,0.08)', borderWidth: 1, borderColor: 'rgba(124,58,237,0.25)', borderRadius: 14, padding: 16 }}>
        <Text style={{ color: '#A855F7', fontWeight: '700', fontSize: 14, marginBottom: 4 }}>Dashboard web completa</Text>
        <Text style={{ color: '#64748B', fontSize: 12, lineHeight: 18 }}>
          Per statistiche avanzate e gestione eventi visita letsnight.it/business dal browser.
        </Text>
      </View>

      <Pressable onPress={handleLogout} style={({ pressed }) => ({ marginHorizontal: 20, marginBottom: 40, borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)', borderRadius: 14, paddingVertical: 16, alignItems: 'center', opacity: pressed ? 0.7 : 1 })}>
        <Text style={{ color: '#F87171', fontWeight: '700', fontSize: 15 }}>Esci dall&apos;account</Text>
      </Pressable>
    </ScrollView>
  );
}
