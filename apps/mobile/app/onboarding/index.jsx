import { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, ScrollView, Animated, Dimensions, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { DEFAULT_CITY, INTERESTS_OPTIONS, COLORS, FONT_FAMILY } from '@lets-night/shared';
import { markOnboarded, saveGuestPrefs } from '../../lib/onboarding';
import { useI18n } from '../../lib/i18n';

const { width } = Dimensions.get('window');

const TOTAL_STEPS = 4;

export default function OnboardingScreen() {
  const { t, tLabel } = useI18n();
  const [step, setStep] = useState(0);
  const city = DEFAULT_CITY; // single-city: nessuna selezione, default Milano
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
      // Risposta utente: success o deny — in entrambi i casi avanziamo.
      await Notifications.requestPermissionsAsync();
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
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
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
            <Text style={{ color: '#64748B', fontSize: 13, fontWeight: '600' }}>{t('common.skip')}</Text>
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
              <View style={{ width: 34, height: 2, backgroundColor: COLORS.brand, borderRadius: 1, marginBottom: 24 }} />
              <Text style={{ fontFamily: FONT_FAMILY.displayHeavy, color: COLORS.textPrimary, fontSize: 36, textAlign: 'center', letterSpacing: -1, lineHeight: 40 }}>
                {t('onboarding.welcomeTitle')}{'\n'}<Text style={{ color: COLORS.brand }}>Let&apos;s Night</Text>
              </Text>
              <Text style={{ color: '#94A3B8', fontSize: 15, textAlign: 'center', marginTop: 16, lineHeight: 22 }}>
                Milano
              </Text>
            </View>
            <View style={{ gap: 14, marginBottom: 30 }}>
              <Bullet icon="flame" text={t('onboarding.b1')} />
              <Bullet icon="ticket" text={t('onboarding.b2')} />
              <Bullet icon="people" text={t('onboarding.b3')} />
            </View>
          </View>
          <BottomCTA label={t('onboarding.start')} onPress={goNext} />
        </View>

        {/* Step città rimosso — lancio Milano-only (vedi CITIES in shared) */}

        {/* Step 1 — Interessi */}
        <View style={[styles.slide, { width }]}>
          <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 30 }}>
            <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>{t('onboarding.stepOf', { n: 1, tot: 2 })}</Text>
            <Text style={styles.h1}>{t('onboarding.interestsTitle')}</Text>
            <Text style={styles.subtitle}>
              {t('onboarding.interestsSub')}
            </Text>
            <ScrollView
              contentContainerStyle={{ paddingTop: 24, paddingBottom: 16 }}
              showsVerticalScrollIndicator={false}
            >
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {INTERESTS_OPTIONS.map(opt => {
                  const active = interests.includes(opt);
                  return (
                    <Pressable
                      key={opt}
                      onPress={() => toggleInterest(opt)}
                      style={({ pressed }) => ({
                        paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999,
                        backgroundColor: active ? '#FAFAFA' : COLORS.bgElev3,
                        opacity: pressed ? 0.8 : 1,
                      })}
                    >
                      <Text style={{ color: active ? COLORS.bg : COLORS.textSecondary, fontWeight: active ? '800' : '600', fontSize: 14 }}>
                        {tLabel(opt)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={{ color: '#64748B', fontSize: 12, marginTop: 16, textAlign: 'center' }}>
                {t('onboarding.selectedCount', { count: interests.length })}
              </Text>
            </ScrollView>
          </View>
          <BottomCTA label={t('onboarding.continueBtn')} onPress={goNext} disabled={interests.length === 0} />
        </View>

        {/* Step 3 — Notifiche */}
        <View style={[styles.slide, { width }]}>
          <View style={{ flex: 1, paddingHorizontal: 28, justifyContent: 'center' }}>
            <View style={{ alignItems: 'center', marginBottom: 32 }}>
              <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: COLORS.brandSubtle, alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}>
                <Ionicons name="notifications" size={40} color={COLORS.brand} />
              </View>
              <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>{t('onboarding.stepOf', { n: 2, tot: 2 })}</Text>
              <Text style={[styles.h1, { textAlign: 'center' }]}>{t('onboarding.notifTitle')}</Text>
              <Text style={[styles.subtitle, { textAlign: 'center', paddingHorizontal: 8 }]}>
                {t('onboarding.notifSub')}
              </Text>
            </View>
            <View style={{ gap: 10, marginBottom: 20 }}>
              <Bullet icon="compass" text={t('onboarding.nb1')} />
              <Bullet icon="alarm" text={t('onboarding.nb2')} />
              <Bullet icon="person-add" text={t('onboarding.nb3')} />
            </View>
          </View>
          <View style={{ paddingHorizontal: 24, paddingBottom: 36 }}>
            <Pressable
              onPress={handleNotifPermission}
              style={({ pressed }) => ({ backgroundColor: '#7C3AED', paddingVertical: 16, borderRadius: 14, alignItems: 'center', opacity: pressed ? 0.85 : 1 })}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{t('onboarding.enableNotifs')}</Text>
            </Pressable>
            <Pressable onPress={goNext} hitSlop={10} style={{ paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ color: '#64748B', fontSize: 13, fontWeight: '600' }}>{t('onboarding.notNow')}</Text>
            </Pressable>
          </View>
        </View>

        {/* Step 4 — Login / Esplora */}
        <View style={[styles.slide, { width }]}>
          <View style={{ flex: 1, paddingHorizontal: 28, justifyContent: 'center' }}>
            <View style={{ alignItems: 'center', marginBottom: 28 }}>
              <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: COLORS.brandSubtle, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <Ionicons name="rocket" size={38} color={COLORS.brand} />
              </View>
              <Text style={[styles.h1, { textAlign: 'center' }]}>{t('onboarding.readyTitle')}</Text>
              <Text style={[styles.subtitle, { textAlign: 'center' }]}>
                {t('onboarding.readySub')}
              </Text>
            </View>
          </View>
          <View style={{ paddingHorizontal: 24, paddingBottom: 36, gap: 10 }}>
            <Pressable
              onPress={() => finish('register')}
              disabled={finishing}
              style={({ pressed }) => ({ backgroundColor: '#7C3AED', paddingVertical: 16, borderRadius: 14, alignItems: 'center', opacity: finishing || pressed ? 0.85 : 1 })}
            >
              {finishing ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{t('onboarding.createAccount')}</Text>}
            </Pressable>
            <Pressable
              onPress={() => finish('login')}
              disabled={finishing}
              style={({ pressed }) => ({ paddingVertical: 16, borderRadius: 14, alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(168,85,247,0.35)', opacity: finishing || pressed ? 0.85 : 1 })}
            >
              <Text style={{ color: '#A855F7', fontWeight: '800', fontSize: 15 }}>{t('onboarding.haveAccountBtn')}</Text>
            </Pressable>
            <Pressable
              onPress={() => finish('explore')}
              disabled={finishing}
              hitSlop={8}
              style={{ paddingVertical: 14, alignItems: 'center' }}
            >
              <Text style={{ color: '#64748B', fontSize: 13, fontWeight: '600' }}>{t('onboarding.exploreNoAccount')}</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

function Bullet({ icon, text }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: COLORS.bgElev2, padding: 14, borderRadius: 12 }}>
      <Ionicons name={icon} size={18} color={COLORS.brand} />
      <Text style={{ color: COLORS.textSecondary, fontSize: 14, flex: 1, lineHeight: 20 }}>{text}</Text>
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
  h1: { fontFamily: FONT_FAMILY.displayHeavy, color: COLORS.textPrimary, fontSize: 28, letterSpacing: -0.5 },
  subtitle: { color: COLORS.textSecondary, fontSize: 14, marginTop: 6, lineHeight: 21 },
};
