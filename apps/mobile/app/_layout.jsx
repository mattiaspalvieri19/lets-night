import '../global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../lib/supabase';

export default function RootLayout() {
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, _session) => {
      // La navigazione è gestita da ciascuna schermata in base alla sessione
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0a0a0f' },
          headerTintColor: '#A855F7',
          headerTitleStyle: { fontWeight: 'bold', color: '#ffffff' },
          contentStyle: { backgroundColor: '#0a0a0f' },
          headerBackVisible: true,
          headerBackTitleVisible: false,
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(business)" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="event/[id]" options={{ title: 'Evento' }} />
        <Stack.Screen name="venue/[id]" options={{ title: 'Locale' }} />
        <Stack.Screen name="user/[id]" options={{ title: 'Profilo' }} />
        <Stack.Screen name="loyalty" options={{ title: 'Carta fedeltà' }} />
        <Stack.Screen name="profile/edit" options={{ title: 'Modifica profilo' }} />
        <Stack.Screen name="profile/privacy" options={{ title: 'Privacy' }} />
        <Stack.Screen name="settings/index" options={{ title: 'Impostazioni' }} />
        <Stack.Screen name="settings/password" options={{ title: 'Cambia password' }} />
        <Stack.Screen name="settings/account" options={{ title: 'Elimina account' }} />
        <Stack.Screen name="business-event/[id]" options={{ title: 'Dettaglio evento' }} />
      </Stack>
    </>
  );
}
