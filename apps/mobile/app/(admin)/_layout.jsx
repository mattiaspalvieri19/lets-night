import { useEffect, useState } from 'react';
import { Tabs, router } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { COLORS } from '@lets-night/shared';

export default function AdminLayout() {
  const [checking, setChecking] = useState(true);

  // Gate come in (business)/_layout: Tabs sempre montati, overlay durante il
  // check. L'autorità è SOLO la membership in admins (self-read via RLS).
  useEffect(() => {
    async function check() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.replace('/auth/login'); return; }
        const { data: adminRow } = await supabase
          .from('admins')
          .select('user_id')
          .eq('user_id', session.user.id)
          .maybeSingle();
        if (!adminRow) { router.replace('/(tabs)'); return; }
      } catch {} finally {
        setChecking(false);
      }
    }
    check();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.replace('/auth/login');
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: COLORS.bgElev1,
            borderTopColor: COLORS.borderSubtle,
            borderTopWidth: 1,
          },
          tabBarActiveTintColor: '#FAFAFA',
          tabBarInactiveTintColor: COLORS.textDisabled,
          tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: 2 },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Dashboard', tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart" size={size} color={color} /> }} />
        <Tabs.Screen name="events" options={{ title: 'Eventi', tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} /> }} />
        <Tabs.Screen name="bookings" options={{ title: 'Prenotazioni', tabBarIcon: ({ color, size }) => <Ionicons name="list" size={size} color={color} /> }} />
        <Tabs.Screen name="venues" options={{ title: 'Locali', tabBarIcon: ({ color, size }) => <Ionicons name="storefront" size={size} color={color} /> }} />
        <Tabs.Screen name="users" options={{ title: 'Utenti', tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} /> }} />
        {/* Route del gruppo ma non tab */}
        <Tabs.Screen name="manage-event/[id]" options={{ href: null }} />
      </Tabs>
      {checking && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={COLORS.brand} size="large" />
        </View>
      )}
    </>
  );
}
