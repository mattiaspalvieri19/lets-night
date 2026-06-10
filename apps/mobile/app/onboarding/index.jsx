import { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, ScrollView, Animated, Dimensions, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { CITIES, INTERESTS_OPTIONS } from '@lets-night/shared';
import { markOnboarded, saveGuestPrefs } from '../../lib/onboarding';

const { width } = Dimensions.get('window');

const TOTAL_STEPS = 5;

export default function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const [city, setCity] = useState(null);
  const [interests, setInterests] = useState([]);
  const [pushDecided, setPushDecided] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: -step * width,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [step, slideAnim]);

  function goNext() {
    if (step < TOTAL_STEPS - 1) setStep(step + 1);
  }
  function goBack() {
    if (step > 0) setStep(step - 1);
  }

  function toggleInterest(t) {
    setInterests(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }

  async function handleNotifPermission() {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      // Risposta utente: success o deny — in entrambi i casi avanziamo.
      console.log('Notif permission:', status);
    } catch (e) {
      console.warn('Notif permission error:', e);
    } finally {
      setPushDecided(true);
      goNext();
    }
  }

  // Salva preferenze + segna onboarded, poi naviga a destinazione.
  async function finish(target) {
    if (finishing) return;
    setFinishing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        // Utente già loggato (raro al primo avvio): aggiorna profile.
        const patch = {};
        if (city) patch.city = city;
        if (interests.length > 0) patch.interests = interests;
        if (Object.keys(patch).length > 0) {
          await supabase.from('profiles').update(patch).eq('id', session.user.id);
        }
      } else {
        await saveGuestPrefs({ city, interests });
      }
    } catch (e) {
      console.error('Onboarding finish error:', e);
    }
    await markOnboarded();
    if (target === 'register') router.replace('/auth/register');
    else if (target === 'login') router.replace('/auth/login');
    else router.replace('/(tabs)');
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0a0a0f' }}>
      {/* Top bar: indicator + skip */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 14 }}>
        <Pressable onPress={goBack} disabled={step === 0} hitSlop={10} style={{ opacity: step === 0 ? 0 : 1 }}>
          <Ionicons name="chevron-back" size={26} color="#A855F7" />
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View key={i} style={{
              width: i === step ? 22 : 6, height: 6, borderRadius: 3,
              backgroundColor: i <= step ? '#A855F7' : 'rgba(168,85,247,0.2)',
            }} />
          ))}
        </View>
        {step < TOTAL_STEPS - 1 ? (
          <Pressable onPress={() => finish('explore')} hitSlop={10}>
            <Text style={{ color: '#64748B', fontSize: 13, fontWeight: '600' }}>Salta</Text>
          </Pressable>
        ) : <View style={{ width: 40 }} />}
      </View>

      {/* Slides */}
      <Animated.View
        style={{
          flexDirection: 'row',
          width: width * TOTAL_STEPS,
          flex: 1,
          transform: [{ translateX: slideAnim }],
        }}
      >
        {/* Step 0 — Welcome */}
        <View style={[styles.slide, { width }]}>
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28 }}>
            <View style={{ alignItems: 'center', marginBottom: 36 }}>
              <Text style={{ fontSize: 76, marginBottom: 12 }}>🌙</Text>
              <Text style={{ color: '#fff', fontSize: 32, fontWeight: '900', textAlign: 'center', letterSpacing: -1, lineHeight: 36 }}>
                Benvenuto su{'\n'}<Text style={{ color: '#A855F7' }}>Let&apos;s Night</Text>
              </Text>
              <Text style={{ color: '#94A3B8', fontSize: 15, textAlign: 'center', marginTop: 16, lineHeight: 22 }}>
                Il TripAdvisor del divertimento.{'\n'}Milano · Roma
              </Text>
            </View>
            <View style={{ gap: 14, marginBottom: 30 }}>
              <Bullet icon="🔥" text="Scopri gli eventi più caldi della tua città" />
              <Bullet icon="🎟️" text="Prenota in pochi tap, mostra il QR all'ingresso" />
              <Bullet icon="👥" text="Vedi dove vanno i tuoi amici stasera" />
            </View>
          </View>
          <BottomCTA label="Iniziamo" onPress={goNext} />
        </View>

        {/* Step 1 — Città */}
        <View style={[styles.slide, { width }]}>
          <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 30 }}>
            <Text style={{ color: '#A855F7', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>Passo 1 di 4</Text>
            <Text style={styles.h1}>Dove vivi la notte?</Text>
            <Text style={styles.subtitle}>Vedrai prima gli eventi della tua città.</Text>
            <View style={{ marginTop: 28, gap: 12 }}>
              {CITIES.map(c => {
                const active = city === c;
                return (
                  <Pressable
                    key={c}
                    onPress={() => setCity(c)}
                    style={({ pressed }) => ({
                      paddingVertical: 22, paddingHorizontal: 22, borderRadius: 16,
                      backgroundColor: active ? 'rgba(124,58,237,0.18)' : '#18181f',
                      borderWidth: 2, borderColor: active ? '#7C3AED' : 'rgba(168,85,247,0.15)',
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                      <Text style={{ fontSize: 28 }}>{c === 'Milano' ? '🏙️' : '🏛️'}</Text>
                      <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>{c}</Text>
                    </View>
                    {active && <Ionicons name="checkmark-circle" size={26} color="#A855F7" />}
                  </Pressable>
                );
              })}
            </View>
          </View>
          <BottomCTA label="Continua" onPress={goNext} disabled={!city} />
        </View>

        {/* Step 2 — Interessi */}
        <View style={[styles.slide, { width }]}>
          <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 30 }}>
            <Text style={{ color: '#A855F7', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>Passo 2 di 4</Text>
            <Text style={styles.h1}>Cosa ti piace?</Text>
            <Text style={styles.subtitle}>
              Scegli almeno 1 categoria — personalizziamo il tuo feed.
            </Text>
            <ScrollView
              contentContainerStyle={{ paddingTop: 24, paddingBottom: 16 }}
              showsVerticalScrollIndicator={false}
            >
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {INTERESTS_OPTIONS.map(t => {
                  const active = interests.includes(t);
                  return (
                    <Pressable
                      key={t}
                      onPress={() => toggleInterest(t)}
                      style={({ pressed }) => ({
                        paddingHorizontal: 16, paddingVertical: 12, borderRadius: 24,
                        backgroundColor: active ? 'rgba(124,58,237,0.2)' : '#18181f',
                        borderWidth: 1.5, borderColor: active ? '#7C3AED' : 'rgba(168,85,247,0.15)',
                        opacity: pressed ? 0.8 : 1,
                      })}
                    >
                      <Text style={{ color: active ? '#fff' : '#94A3B8', fontWeight: active ? '800' : '600', fontSize: 14 }}>
                        {t}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={{ color: '#64748B', fontSize: 12, marginTop: 16, textAlign: 'center' }}>
                {interests.length} selezionati · puoi cambiarli in qualsiasi momento
              </Text>
            </ScrollView>
          </View>
          <BottomCTA label="Continua" onPress={goNext} disabled={interests.length === 0} />
        </View>

        {/* Step 3 — Notifiche */}
        <View style={[styles.slide, { width }]}>
          <View style={{ flex: 1, paddingHorizontal: 28, justifyContent: 'center' }}>
            <View style={{ alignItems: 'center', marginBottom: 32 }}>
              <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(168,85,247,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}>
                <Text style={{ fontSize: 52 }}>🔔</Text>
              </View>
              <Text style={{ color: '#A855F7', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>Passo 3 di 4</Text>
              <Text style={[styles.h1, { textAlign: 'center' }]}>Non perdere un colpo</Text>
              <Text style={[styles.subtitle, { textAlign: 'center', paddingHorizontal: 8 }]}>
                Ti avvisiamo solo quando arriva un evento che potrebbe piacerti e per ricordarti le tue prenotazioni.
              </Text>
            </View>
            <View style={{ gap: 10, marginBottom: 20 }}>
              <Bullet icon="🎯" text="Nuovi eventi nella tua categoria preferita" />
              <Bullet icon="⏰" text="Promemoria 24h prima del tuo evento" />
              <Bullet icon="👋" text="Quando un amico prenota una serata" />
            </View>
          </View>
          <View style={{ paddingHorizontal: 24, paddingBottom: 36 }}>
            <Pressable
              onPress={handleNotifPermission}
              style={({ pressed }) => ({ backgroundColor: '#7C3AED', paddingVertical: 16, borderRadius: 14, alignItems: 'center', opacity: pressed ? 0.85 : 1 })}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Attiva notifiche</Text>
            </Pressable>
            <Pressable onPress={goNext} hitSlop={10} style={{ paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ color: '#64748B', fontSize: 13, fontWeight: '600' }}>Non adesso</Text>
            </Pressable>
          </View>
        </View>

        {/* Step 4 — Login / Esplora */}
        <View style={[styles.slide, { width }]}>
          <View style={{ flex: 1, paddingHorizontal: 28, justifyContent: 'center' }}>
            <View style={{ alignItems: 'center', marginBottom: 28 }}>
              <Text style={{ fontSize: 56, marginBottom: 16 }}>🚀</Text>
              <Text style={[styles.h1, { textAlign: 'center' }]}>Sei pronto!</Text>
              <Text style={[styles.subtitle, { textAlign: 'center' }]}>
                Accedi per salvare preferiti, prenotare e seguire amici. Oppure esplora subito.
              </Text>
            </View>
          </View>
          <View style={{ paddingHorizontal: 24, paddingBottom: 36, gap: 10 }}>
            <Pressable
              onPress={() => finish('register')}
              disabled={finishing}
              style={({ pressed }) => ({ backgroundColor: '#7C3AED', paddingVertical: 16, borderRadius: 14, alignItems: 'center', opacity: finishing || pressed ? 0.85 : 1 })}
            >
              {finishing ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Crea account</Text>}
            </Pressable>
            <Pressable
              onPress={() => finish('login')}
              disabled={finishing}
              style={({ pressed }) => ({ paddingVertical: 16, borderRadius: 14, alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(168,85,247,0.35)', opacity: finishing || pressed ? 0.85 : 1 })}
            >
              <Text style={{ color: '#A855F7', fontWeight: '800', fontSize: 15 }}>Ho già un account</Text>
            </Pressable>
            <Pressable
              onPress={() => finish('explore')}
              disabled={finishing}
              hitSlop={8}
              style={{ paddingVertical: 14, alignItems: 'center' }}
            >
              <Text style={{ color: '#64748B', fontSize: 13, fontWeight: '600' }}>Esplora senza account</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

function Bullet({ icon, text }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: 'rgba(168,85,247,0.06)', padding: 14, borderRadius: 12 }}>
      <Text style={{ fontSize: 22 }}>{icon}</Text>
      <Text style={{ color: '#E2E8F0', fontSize: 14, flex: 1, lineHeight: 20 }}>{text}</Text>
    </View>
  );
}

function BottomCTA({ label, onPress, disabled }) {
  return (
    <View style={{ paddingHorizontal: 24, paddingBottom: 36 }}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => ({
          backgroundColor: disabled ? '#3f3f5a' : '#7C3AED',
          paddingVertical: 16, borderRadius: 14, alignItems: 'center',
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{label}</Text>
      </Pressable>
    </View>
  );
}

const styles = {
  slide: { flex: 1 },
  h1: { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { color: '#94A3B8', fontSize: 14, marginTop: 6, lineHeight: 21 },
};
