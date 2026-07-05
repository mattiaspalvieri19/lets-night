import '../global.css';
import { useEffect, useRef } from 'react';
import { Linking, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import {
  useFonts,
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque';
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
  // Font display (Bricolage Grotesque). Lo Stack resta SEMPRE montato (vedi nota sotto):
  // finché i font non sono pronti copriamo con un overlay — RN fa fallback al font di
  // sistema sotto, e al load il re-render del layout applica il font corretto.
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
  });

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
      const t = data.type;
      const actor = data.follower_id || data.actor_id;
      const ev = data.event_id || data.eventId;
      // Tipi del centro notifiche (send-push) + vecchi tipi (notify-follower/booking).
      if (t === 'follow' && UUID_RE.test(actor)) {
        router.push(`/user/${actor}`);
      } else if (t === 'booking_confirmed' && UUID_RE.test(data.booking_id)) {
        router.push(`/ticket/${data.booking_id}`);
      } else if ((t === 'booking' || t === 'friend_booking' || t === 'reminder') && UUID_RE.test(ev)) {
        router.push(`/event/${ev}`);
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
          headerStyle: { backgroundColor: '#0A0A0C' },
          headerTintColor: '#FAFAFA',
          headerTitleStyle: { fontFamily: 'BricolageGrotesque_700Bold', color: '#FAFAFA', fontSize: 17 },
          contentStyle: { backgroundColor: '#0A0A0C' },
          headerBackVisible: true,
          // RN7: headerBackTitleVisible non esiste più — 'minimal' mostra solo il chevron
          // (prima compariva il nome della route precedente, es. "(tabs)").
          headerBackButtonDisplayMode: 'minimal',
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(business)" options={{ headerShown: false }} />
        <Stack.Screen name="(admin)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding/index" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="event/[id]" options={{ title: 'Evento' }} />
        <Stack.Screen name="ticket/[id]" options={{ title: 'Il tuo biglietto' }} />
        <Stack.Screen name="notifications" options={{ title: 'Notifiche' }} />
        <Stack.Screen name="venue/[id]" options={{ title: 'Locale' }} />
        <Stack.Screen name="user/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="loyalty" options={{ title: 'Carta fedeltà' }} />
        <Stack.Screen name="profile/edit" options={{ headerShown: false }} />
        <Stack.Screen name="profile/privacy" options={{ title: 'Privacy' }} />
        <Stack.Screen name="settings/index" options={{ title: 'Impostazioni' }} />
        <Stack.Screen name="settings/password" options={{ headerShown: false }} />
        <Stack.Screen name="settings/account" options={{ title: 'Elimina account' }} />
        <Stack.Screen name="business-event/[id]" options={{ headerShown: false }} />
      </Stack>
      {!fontsLoaded && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0A0A0C' }} />
      )}
    </>
  );
}
