import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS, FONT_FAMILY } from '@lets-night/shared';
import { supabase } from '../../lib/supabase';

export default function ChangePasswordScreen() {
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);


  async function handleSave() {
    setError(''); setSuccess(false);
    if (newPassword.length < 6) {
      setError('La password deve essere di almeno 6 caratteri.');
      return;
    }
    if (newPassword !== confirm) {
      setError('Le password non coincidono.');
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (err) {
      setError(err.message.includes('same password')
        ? 'La nuova password deve essere diversa da quella attuale.'
        : 'Impossibile aggiornare la password. Riprova.');
      return;
    }
    setSuccess(true);
    setNewPassword('');
    setConfirm('');
  }

  const inputStyle = {
    backgroundColor: COLORS.bgElev3, borderWidth: 1, borderColor: COLORS.borderStrong,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    color: COLORS.textPrimary, fontSize: 14, marginBottom: 14,
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: COLORS.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))} hitSlop={10}>
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </View>
        </Pressable>
        <Pressable onPress={handleSave} disabled={loading} hitSlop={6} style={({ pressed }) => ({ opacity: loading || pressed ? 0.5 : 1 })}>
          {loading ? <ActivityIndicator color={COLORS.textPrimary} size="small" /> : <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 16 }}>Salva</Text>}
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: COLORS.brand, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>Sicurezza</Text>
        <Text style={{ fontFamily: FONT_FAMILY.displayHeavy, color: COLORS.textPrimary, fontSize: 24, marginBottom: 8 }}>Cambia password</Text>
        <Text style={{ color: COLORS.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 28 }}>
          Scegli una password sicura di almeno 6 caratteri.
        </Text>

        {error ? (
          <View style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: 10, padding: 12, marginBottom: 16 }}>
            <Text style={{ color: '#fca5a5', fontSize: 13 }}>{error}</Text>
          </View>
        ) : null}

        {success ? (
          <View style={{ backgroundColor: 'rgba(74,222,128,0.1)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)', borderRadius: 10, padding: 12, marginBottom: 16 }}>
            <Text style={{ color: COLORS.success, fontSize: 13 }}>Password aggiornata.</Text>
          </View>
        ) : null}

        <Text style={{ color: COLORS.textMuted, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>
          Nuova password
        </Text>
        <TextInput
          style={inputStyle}
          placeholder="Minimo 6 caratteri"
          placeholderTextColor={COLORS.textDisabled}
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
        />

        <Text style={{ color: COLORS.textMuted, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>
          Conferma password
        </Text>
        <TextInput
          style={inputStyle}
          placeholder="Ripeti la password"
          placeholderTextColor={COLORS.textDisabled}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
        />

        {success && (
          <Pressable onPress={() => router.back()} style={{ marginTop: 14, alignItems: 'center' }}>
            <Text style={{ color: COLORS.brand, fontWeight: '700' }}>Torna alle impostazioni</Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
