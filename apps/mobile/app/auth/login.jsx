import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { Link, router } from 'expo-router';
import { supabase } from '../../lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin() {
    if (!email || !password || loading) return;
    setLoading(true);
    setError('');

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      if (authError.message.includes('Email not confirmed')) {
        setError('Conferma la tua email prima di accedere.');
      } else {
        setError('Email o password non corretti.');
      }
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single();

    setLoading(false);

    if (profile?.role === 'business') {
      Alert.alert(
        'Portale business',
        'Per gestire il tuo locale accedi dal sito web. Sull\'app puoi esplorare gli eventi.',
        [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]
      );
    } else {
      router.replace('/(tabs)');
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-dark"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View className="flex-1 px-6 pt-10 pb-8">

          <View className="mb-10">
            <Text className="text-white text-3xl font-bold">
              Let&apos;s<Text className="text-brand">Night</Text>
            </Text>
            <Text className="text-gray-400 mt-2 text-base">Accedi al tuo account</Text>
          </View>

          {error ? (
            <View className="bg-red-900/40 border border-red-700 rounded-xl px-4 py-3 mb-5">
              <Text className="text-red-400 text-sm">{error}</Text>
            </View>
          ) : null}

          <View className="gap-4">
            <View>
              <Text className="text-gray-400 text-sm mb-2">Email</Text>
              <TextInput
                className="bg-card border border-gray-700 text-white rounded-xl px-4 py-4"
                placeholder="la@tua.email"
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
              : <Text className="text-white font-bold text-base">Accedi</Text>
            }
          </Pressable>

          <View className="flex-row justify-center items-center mt-6 gap-1">
            <Text className="text-gray-400">Non hai un account?</Text>
            <Link href="/auth/register">
              <Text className="text-brand font-semibold"> Registrati</Text>
            </Link>
          </View>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
