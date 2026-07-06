import { useEffect, useState } from 'react';
import { Tabs, router } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { COLORS } from '@lets-night/shared';
import { useI18n } from '../../lib/i18n';

export default function BusinessLayout() {
  const { t } = useI18n();
  const [checking, setChecking] = useState(true);

  // Gate auth SENZA montare il navigatore in modo condizionale (anti-pattern che
  // rompe la navigazione dei Tabs — stesso bug dello schermo nero al root):
  // i Tabs sono sempre montati, durante il check li copre un overlay.
  useEffect(() => {
    async function check() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.replace('/auth/login'); return; }
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
        if (profile && profile.role !== 'business') { router.replace('/(tabs)'); return; }
      } catch {} finally {
        // Sempre: un errore di rete non deve lasciare l'overlay a bloccare i touch.
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
          // NB: niente height/padding custom — l'altezza forzata disallineava
          // l'area touch della barra (tap "morti"); il default gestisce la safe area.
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
        <Tabs.Screen name="index" options={{ title: t('biz.tabDashboard'), tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart" size={size} color={color} /> }} />
        <Tabs.Screen name="events" options={{ title: t('biz.tabEvents'), tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} /> }} />
        <Tabs.Screen name="bookings" options={{ title: t('biz.tabBookings'), tabBarIcon: ({ color, size }) => <Ionicons name="list" size={size} color={color} /> }} />
        <Tabs.Screen name="scanner" options={{ title: t('biz.tabScanner'), tabBarIcon: ({ color, size }) => <Ionicons name="qr-code" size={size} color={color} /> }} />
        <Tabs.Screen name="profile" options={{ title: t('biz.tabVenue'), tabBarIcon: ({ color, size }) => <Ionicons name="storefront" size={size} color={color} /> }} />
        {/* Route del gruppo ma non tab: senza href:null comparirebbe come sesto tab */}
        <Tabs.Screen name="venue/edit" options={{ href: null }} />
      </Tabs>
      {checking && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={COLORS.brand} size="large" />
        </View>
      )}
    </>
  );
}
