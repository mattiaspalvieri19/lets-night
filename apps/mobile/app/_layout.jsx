import '../global.css';
import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabase';
import { registerForPushNotifications } from '../lib/notifications';
import { isOnboarded, getGuestPrefs, clearGuestPrefs } from '../lib/onboarding';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

// Recovery: se il deep link letsnight://payment-return arriva DOPO che la BookingModal è chiusa
// (utente che ha backgroundato l'app durante checkout), questo handler globale completa il flusso
// chiamando confirm-booking e portando l'utente sui suoi biglietti.
async function handlePaymentReturnUrl(url) {
  if (!url || !url.includes('payment-return')) return;
  const statusMatch = url.match(/[?&]status=([^&]+)/);
  const sessionMatch = url.match(/[?&]session_id=([^&]+)/);
  const status = statusMatch ? decodeURIComponent(statusMatch[1]) : null;
  const sessionId = sessionMatch ? decodeURIComponent(sessionMatch[1]) : null;
  if (status !== 'success' || !sessionId) return;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  try {
    await fetch(`${API_URL}/api/stripe/confirm-booking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, accessToken: session.access_token }),
    });
  } catch {}
  router.push('/(tabs)/tickets');
}

export default function RootLayout() {
  const responseListener = useRef(null);

  // Gate onboarding: al primo avvio (flag AsyncStorage assente) redirige a /onboarding.
  // NB: lo <Stack> sotto va renderizzato SEMPRE — montare il navigatore in modo
  // condizionale rompe la navigazione di Expo Router e lascia lo schermo nero.
  useEffect(() => {
    (async () => {
      try {
        const done = await isOnboarded();
        if (!done) router.replace('/onboarding');
      } catch {}
    })();
  }, []);

  useEffect(() => {
    // Registra push token al login + import preferenze raccolte durante onboarding ospite.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event !== 'SIGNED_IN' || !session?.user?.id) return;
      registerForPushNotifications(session.user.id);
      try {
        const prefs = await getGuestPrefs();
        if (!prefs) return;
        const { data: prof } = await supabase
          .from('profiles')
          .select('city, interests')
          .eq('id', session.user.id)
          .maybeSingle();
        const patch = {};
        if (prefs.city && !prof?.city) patch.city = prefs.city;
        if (prefs.interests?.length && !(prof?.interests?.length)) patch.interests = prefs.interests;
        if (Object.keys(patch).length > 0) {
          await supabase.from('profiles').update(patch).eq('id', session.user.id);
        }
        await clearGuestPrefs();
      } catch (e) {
        console.warn('Guest prefs import failed:', e);
      }
    });

    // Tap su notifica → naviga alla schermata corretta
    const UUID_RE = /^[0-9a-f-]{36}$/i;
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data || {};
      if (data.type === 'follow' && UUID_RE.test(data.follower_id)) {
        router.push(`/user/${data.follower_id}`);
      } else if (data.type === 'booking' && UUID_RE.test(data.event_id)) {
        router.push(`/event/${data.event_id}`);
      } else if (data.type === 'reminder' && UUID_RE.test(data.eventId)) {
        router.push(`/event/${data.eventId}`);
      }
    });

    // Recovery deep link payment-return (es. utente backgrounding durante checkout)
    Linking.getInitialURL().then(url => { if (url) handlePaymentReturnUrl(url); });
    const linkingSub = Linking.addEventListener('url', e => handlePaymentReturnUrl(e.url));

    return () => {
      subscription.unsubscribe();
      // expo-notifications SDK 53+: Notifications.removeNotificationSubscription è stato
      // rimosso → si chiama .remove() direttamente sull'oggetto subscription.
      responseListener.current?.remove();
      linkingSub?.remove?.();
    };
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
        <Stack.Screen name="onboarding/index" options={{ headerShown: false, gestureEnabled: false }} />
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
