import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Keyboard } from 'react-native';
import { Link, router } from 'expo-router';
import { LANGS } from '@lets-night/shared';
import { supabase } from '../../lib/supabase';
import { useI18n } from '../../lib/i18n';

// Risolve quando la tastiera è DAVVERO scomparsa (o dopo 600ms di sicurezza).
// Navigare durante l'animazione di chiusura lascia alla schermata di destinazione
// una cornice nativa accorciata → tab bar visibile ma non toccabile.
function waitKeyboardHidden() {
  return new Promise(resolve => {
    if (!Keyboard.isVisible()) { resolve(); return; }
    let done = false;
    const finish = () => { if (done) return; done = true; sub.remove(); resolve(); };
    const sub = Keyboard.addListener('keyboardDidHide', finish);
    setTimeout(finish, 600);
  });
}

export default function LoginScreen() {
  const { t, lang, setLang } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin() {
    if (!email || !password || loading) return;
    // Chiudi la tastiera PRIMA di navigare: una replace con tastiera aperta può
    // lasciare alla schermata di destinazione una cornice nativa accorciata
    // (fascia inferiore non toccabile → tab bar "morta").
    Keyboard.dismiss();
    setLoading(true);
    setError('');

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      if (authError.message.includes('Email not confirmed')) {
        setError(t('auth.errorEmailNotConfirmed'));
      } else {
        setError(t('auth.errorBadCredentials'));
      }
      setLoading(false);
      return;
    }

    // Naviga SOLO a tastiera completamente chiusa, e SEMPRE passando dall'index:
    // app/index.js smista già per ruolo (business → dashboard). Entrare in
    // /(business) direttamente dal form login lasciava la tab bar con una fascia
    // touch nativa morta; il percorso via index è l'unico dimostrato sano.
    await waitKeyboardHidden();
    setLoading(false);
    router.replace('/');
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-dark"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View className="flex-1 px-6 pt-10 pb-8">

          <View className="mb-10">
            <Text className="text-white" style={{ fontFamily: 'BricolageGrotesque_800ExtraBold', fontSize: 30, letterSpacing: -0.6 }}>
              Let&apos;s<Text className="text-brand-light">Night</Text>
            </Text>
            <Text className="text-gray-400 mt-2 text-base">{t('auth.loginSubtitle')}</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 14 }}>
              {LANGS.map(l => {
                const active = lang === l.code;
                return (
                  <Pressable key={l.code} onPress={() => setLang(l.code)}
                    style={{ paddingHorizontal: 11, paddingVertical: 6, borderRadius: 14, backgroundColor: active ? '#FAFAFA' : 'transparent', borderWidth: 1, borderColor: active ? '#FAFAFA' : 'rgba(255,255,255,0.14)' }}>
                    <Text style={{ color: active ? '#0A0A0C' : '#9CA3AF', fontSize: 11, fontWeight: active ? '700' : '500' }}>
                      {l.code.toUpperCase()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {error ? (
            <View className="bg-red-900/40 border border-red-700 rounded-xl px-4 py-3 mb-5">
              <Text className="text-red-400 text-sm">{error}</Text>
            </View>
          ) : null}

          <View className="gap-4">
            <View>
              <Text className="text-gray-400 text-sm mb-2">{t('auth.email')}</Text>
              <TextInput
                className="bg-card border border-white/10 text-white rounded-xl px-4 py-4"
                placeholder={t('auth.emailPlaceholder')}
                placeholderTextColor="#555577"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
            </View>

            <View>
              <Text className="text-gray-400 text-sm mb-2">{t('auth.password')}</Text>
              <TextInput
                className="bg-card border border-white/10 text-white rounded-xl px-4 py-4"
                placeholder="••••••••"
                placeholderTextColor="#555577"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="password"
              />
            </View>
          </View>

          <Pressable
            onPress={handleLogin}
            disabled={loading}
            className="bg-brand rounded-xl py-4 items-center mt-8"
          >
            {loading
              ? <ActivityIndicator color="#ffffff" />
              : <Text className="text-white font-bold text-base">{t('auth.login')}</Text>
            }
          </Pressable>

          <View className="flex-row justify-center items-center mt-6 gap-1">
            <Text className="text-gray-400">{t('auth.noAccount')}</Text>
            <Link href="/auth/register">
              <Text className="text-brand font-semibold"> {t('auth.register')}</Text>
            </Link>
          </View>

          <View className="mt-8 pt-6 border-t border-gray-800 items-center">
            <Text className="text-gray-500 text-sm mb-2">{t('auth.areYouVenue')}</Text>
            <Link href="/auth/business-register">
              <Text className="text-brand font-semibold text-sm">{t('auth.registerVenue')}</Text>
            </Link>
          </View>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
