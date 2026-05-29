import { useEffect, useState } from 'react';
import { Tabs, router } from 'expo-router';
import { View, Text, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';

function TabIcon({ name, focused }) {
  const icons = { dashboard: '📊', events: '🎉', bookings: '📋', scanner: '📷', profile: '🏠' };
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{icons[name]}</Text>
    </View>
  );
}

export default function BusinessLayout() {
  const [authorized, setAuthorized] = useState(null);

  useEffect(() => {
    async function check() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/auth/login'); return; }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
      if (profile?.role !== 'business') { router.replace('/(tabs)'); return; }
      setAuthorized(true);
    }
    check();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.replace('/auth/login');
    });
    return () => subscription.unsubscribe();
  }, []);

  if (!authorized) {
    return (
      <View style={{ flex: 1, backgroundColor: '#09090f', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#A855F7" size="large" />
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#111118',
          borderTopColor: 'rgba(168,85,247,0.18)',
          borderTopWidth: 1,
          height: 80,
          paddingBottom: 16,
        },
        tabBarActiveTintColor: '#A855F7',
        tabBarInactiveTintColor: '#4B5563',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: 2 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dashboard', tabBarIcon: ({ focused }) => <TabIcon name="dashboard" focused={focused} /> }} />
      <Tabs.Screen name="events" options={{ title: 'Eventi', tabBarIcon: ({ focused }) => <TabIcon name="events" focused={focused} /> }} />
      <Tabs.Screen name="bookings" options={{ title: 'Prenotazioni', tabBarIcon: ({ focused }) => <TabIcon name="bookings" focused={focused} /> }} />
      <Tabs.Screen name="scanner" options={{ title: 'Scanner', tabBarIcon: ({ focused }) => <TabIcon name="scanner" focused={focused} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Locale', tabBarIcon: ({ focused }) => <TabIcon name="profile" focused={focused} /> }} />
    </Tabs>
  );
}
