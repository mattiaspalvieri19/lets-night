import { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, BackHandler } from 'react-native';
import { Link, router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { CITIES, LANGS } from '@lets-night/shared';
import { useI18n } from '../../lib/i18n';

export default function RegisterScreen() {
  const { t, lang, setLang } = useI18n();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState(null);
  const [city, setCity] = useState('Milano');

  function handleBirthDateChange(text) {
    const digits = text.replace(/\D/g, '');
    let formatted = digits;
    if (digits.length > 2) formatted = digits.slice(0, 2) + '/' + digits.slice(2);
    if (digits.length > 4) formatted = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4, 8);
    setBirthDate(formatted);
  }

  function parseBirthDate(str) {
    const match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    if (month < 1 || month > 12 || day < 1) return null;
    if (day > new Date(year, month, 0).getDate()) return null;
    return `${match[3]}-${match[2]}-${match[1]}`;
  }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function handleRegister() {
    if (!fullName || !email || !password || loading) return;
    if (password.length < 6) {
      setError(t('auth.errorPasswordShort'));
      return;
    }
    const birthDateISO = parseBirthDate(birthDate);
    if (!birthDateISO) {
      setError(t('auth.errorBirthDate'));
      return;
    }
    setLoading(true);
    setError('');

    // Pre-check telefono via RPC (bypassa RLS profiles per utente non autenticato)
    if (phone) {
      const { data: available, error: rpcErr } = await supabase.rpc('check_phone_available', { p_phone: phone });
      if (rpcErr || available == null) {
        setError(t('auth.errorPhoneCheck'));
        setLoading(false);
        return;
      }
      if (available === false) {
        setError(t('auth.errorPhoneTaken'));
        setLoading(false);
        return;
      }
    }

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: 'letsnight://auth/callback',
        data: {
          full_name: fullName,
          role: 'user',
          phone: phone || null,
          city,
          birth_date: birthDateISO,
          gender: gender || null,
        },
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (data?.user && (!data.user.identities || data.user.identities.length === 0)) {
      setError(t('auth.errorEmailTaken'));
      setLoading(false);
      return;
    }

    // Profilo gestito dal trigger SQL handle_new_user
    setLoading(false);
    setSent(true);
  }

  useEffect(() => {
    if (!sent) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      router.replace('/auth/login');
      return true;
    });
    return () => sub.remove();
  }, [sent]);

  if (sent) {
    return (
      <View className="flex-1 bg-dark px-6 items-center justify-center">
        <Stack.Screen options={{ gestureEnabled: false, headerBackVisible: false }} />
        <View className="items-center">
          <View className="w-16 h-16 bg-brand/20 rounded-full items-center justify-center mb-6">
            <Ionicons name="checkmark" size={30} color="#A855F7" />
          </View>
          <Text className="text-white text-2xl font-bold text-center mb-3">{t('auth.checkEmailTitle')}</Text>
          <Text className="text-gray-400 text-center text-base leading-6">
            {t('auth.checkEmailBody')}{'\n'}
            <Text className="text-white font-semibold">{email}</Text>
          </Text>
          <Text className="text-gray-500 text-sm text-center mt-4">
            {t('auth.checkEmailHint')}
          </Text>
          <Pressable onPress={() => router.replace('/auth/login')} className="mt-8">
            <Text className="text-brand font-semibold">{t('auth.goToLogin')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-dark"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View className="flex-1 px-6 pt-8 pb-8">

          <Text className="text-gray-400 text-base mb-2">{t('auth.registerSubtitle')}</Text>
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 24 }}>
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

          {error ? (
            <View className="bg-red-900/40 border border-red-700 rounded-xl px-4 py-3 mb-5">
              <Text className="text-red-400 text-sm">{error}</Text>
            </View>
          ) : null}

          <View className="gap-4">
            <View>
              <Text className="text-gray-400 text-sm mb-2">{t('auth.fullName')}</Text>
              <TextInput
                className="bg-card border border-white/10 text-white rounded-xl px-4 py-4"
                placeholder={t('auth.fullNamePlaceholder')}
                placeholderTextColor="#555577"
                value={fullName}
                onChangeText={setFullName}
                autoComplete="name"
              />
            </View>

            <View>
              <Text className="text-gray-400 text-sm mb-2">{t('auth.email')}</Text>
              <TextInput
                className="bg-card border border-white/10 text-white rounded-xl px-4 py-4"
                placeholder="mario@email.com"
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
                placeholder={t('auth.passwordMinPlaceholder')}
                placeholderTextColor="#555577"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>

            <View>
              <Text className="text-gray-400 text-sm mb-2">{t('auth.phoneOptional')}</Text>
              <TextInput
                className="bg-card border border-white/10 text-white rounded-xl px-4 py-4"
                placeholder="+39 333 000 0000"
                placeholderTextColor="#555577"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </View>

            <View>
              <Text className="text-gray-400 text-sm mb-2">{t('auth.birthDate')}</Text>
              <TextInput
                className="bg-card border border-white/10 text-white rounded-xl px-4 py-4"
                placeholder={t('auth.birthDatePlaceholder')}
                placeholderTextColor="#555577"
                value={birthDate}
                onChangeText={handleBirthDateChange}
                keyboardType="number-pad"
                maxLength={10}
              />
            </View>

            <View>
              <Text className="text-gray-400 text-sm mb-2">{t('auth.gender')}</Text>
              <View className="flex-row gap-3">
                {[{ v: 'M', l: t('auth.genderM') }, { v: 'F', l: t('auth.genderF') }, { v: 'X', l: t('auth.genderX') }].map(g => (
                  <Pressable
                    key={g.v}
                    onPress={() => setGender(g.v)}
                    className={`flex-1 py-4 rounded-xl border items-center ${gender === g.v ? 'bg-white border-white' : 'bg-card border-white/10'}`}
                  >
                    <Text className={gender === g.v ? 'text-black font-bold' : 'text-gray-400'}>{g.l}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {CITIES.length > 1 && (
              <View>
                <Text className="text-gray-400 text-sm mb-2">{t('auth.city')}</Text>
                <View className="flex-row gap-3">
                  {CITIES.map(c => (
                    <Pressable
                      key={c}
                      onPress={() => setCity(c)}
                      className={`flex-1 py-4 rounded-xl border items-center ${city === c ? 'bg-white border-white' : 'bg-card border-white/10'}`}
                    >
                      <Text className={city === c ? 'text-black font-bold' : 'text-gray-400'}>{c}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </View>

          <Pressable
            onPress={handleRegister}
            disabled={loading}
            className="bg-brand rounded-xl py-4 items-center mt-8"
          >
            {loading
              ? <ActivityIndicator color="#ffffff" />
              : <Text className="text-white font-bold text-base">{t('auth.createAccount')}</Text>
            }
          </Pressable>

          <View className="flex-row justify-center items-center mt-6 gap-1">
            <Text className="text-gray-400">{t('auth.haveAccount')}</Text>
            <Link href="/auth/login">
              <Text className="text-brand font-semibold"> {t('auth.login')}</Text>
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
