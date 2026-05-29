import { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, BackHandler } from 'react-native';
import { Link, router, Stack } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { CITIES } from '@lets-night/shared';

export default function RegisterScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
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
      setError('La password deve essere di almeno 6 caratteri.');
      return;
    }
    const birthDateISO = parseBirthDate(birthDate);
    if (!birthDateISO) {
      setError('Inserisci una data di nascita valida (GG/MM/AAAA).');
      return;
    }
    setLoading(true);
    setError('');

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: 'letsnight://auth/callback',
        data: { full_name: fullName, role: 'user' },
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: data.user.id,
          full_name: fullName,
          role: 'user',
          phone: phone || null,
          city,
          birth_date: birthDateISO,
        });
      if (profileError) console.error('Errore profilo:', profileError);
    }

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
            <Text className="text-brand text-3xl">✓</Text>
          </View>
          <Text className="text-white text-2xl font-bold text-center mb-3">Controlla la tua email</Text>
          <Text className="text-gray-400 text-center text-base leading-6">
            Abbiamo inviato un link di conferma a{'\n'}
            <Text className="text-white font-semibold">{email}</Text>
          </Text>
          <Text className="text-gray-500 text-sm text-center mt-4">
            Clicca il link nell&apos;email per attivare il tuo account.
          </Text>
          <Pressable onPress={() => router.replace('/auth/login')} className="mt-8">
            <Text className="text-brand font-semibold">Vai al login</Text>
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

          <Text className="text-gray-400 text-base mb-8">Crea il tuo account gratuito</Text>

          {error ? (
            <View className="bg-red-900/40 border border-red-700 rounded-xl px-4 py-3 mb-5">
              <Text className="text-red-400 text-sm">{error}</Text>
            </View>
          ) : null}

          <View className="gap-4">
            <View>
              <Text className="text-gray-400 text-sm mb-2">Nome completo</Text>
              <TextInput
                className="bg-card border border-gray-700 text-white rounded-xl px-4 py-4"
                placeholder="Mario Rossi"
                placeholderTextColor="#555577"
                value={fullName}
                onChangeText={setFullName}
                autoComplete="name"
              />
            </View>

            <View>
              <Text className="text-gray-400 text-sm mb-2">Email</Text>
              <TextInput
                className="bg-card border border-gray-700 text-white rounded-xl px-4 py-4"
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
              <Text className="text-gray-400 text-sm mb-2">Password</Text>
              <TextInput
                className="bg-card border border-gray-700 text-white rounded-xl px-4 py-4"
                placeholder="Minimo 6 caratteri"
                placeholderTextColor="#555577"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>

            <View>
              <Text className="text-gray-400 text-sm mb-2">Telefono (opzionale)</Text>
              <TextInput
                className="bg-card border border-gray-700 text-white rounded-xl px-4 py-4"
                placeholder="+39 333 000 0000"
                placeholderTextColor="#555577"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </View>

            <View>
              <Text className="text-gray-400 text-sm mb-2">Data di nascita</Text>
              <TextInput
                className="bg-card border border-gray-700 text-white rounded-xl px-4 py-4"
                placeholder="GG/MM/AAAA"
                placeholderTextColor="#555577"
                value={birthDate}
                onChangeText={handleBirthDateChange}
                keyboardType="number-pad"
                maxLength={10}
              />
            </View>

            <View>
              <Text className="text-gray-400 text-sm mb-2">Città</Text>
              <View className="flex-row gap-3">
                {CITIES.map(c => (
                  <Pressable
                    key={c}
                    onPress={() => setCity(c)}
                    className={`flex-1 py-4 rounded-xl border items-center ${city === c ? 'bg-brand border-brand' : 'bg-card border-gray-700'}`}
                  >
                    <Text className={city === c ? 'text-white font-semibold' : 'text-gray-400'}>{c}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          <Pressable
            onPress={handleRegister}
            disabled={loading}
            className="bg-brand rounded-xl py-4 items-center mt-8"
          >
            {loading
              ? <ActivityIndicator color="#ffffff" />
              : <Text className="text-white font-bold text-base">Crea account</Text>
            }
          </Pressable>

          <View className="flex-row justify-center items-center mt-6 gap-1">
            <Text className="text-gray-400">Hai già un account?</Text>
            <Link href="/auth/login">
              <Text className="text-brand font-semibold"> Accedi</Text>
            </Link>
          </View>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
