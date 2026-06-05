import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { router } from 'expo-router';
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
    backgroundColor: '#18181f', borderWidth: 1, borderColor: 'rgba(168,85,247,0.2)',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    color: '#fff', fontSize: 14, marginBottom: 14,
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#09090f' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: '#A855F7', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>Sicurezza</Text>
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900', marginBottom: 8 }}>Cambia password</Text>
        <Text style={{ color: '#9CA3AF', fontSize: 13, lineHeight: 19, marginBottom: 28 }}>
          Scegli una password sicura di almeno 6 caratteri.
        </Text>

        {error ? (
          <View style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: 10, padding: 12, marginBottom: 16 }}>
            <Text style={{ color: '#fca5a5', fontSize: 13 }}>{error}</Text>
          </View>
        ) : null}

        {success ? (
          <View style={{ backgroundColor: 'rgba(74,222,128,0.1)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)', borderRadius: 10, padding: 12, marginBottom: 16 }}>
            <Text style={{ color: '#4ade80', fontSize: 13 }}>Password aggiornata.</Text>
          </View>
        ) : null}

        <Text style={{ color: '#64748B', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>
          Nuova password
        </Text>
        <TextInput
          style={inputStyle}
          placeholder="Minimo 6 caratteri"
          placeholderTextColor="#4B5563"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
        />

        <Text style={{ color: '#64748B', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>
          Conferma password
        </Text>
        <TextInput
          style={inputStyle}
          placeholder="Ripeti la password"
          placeholderTextColor="#4B5563"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
        />

        <Pressable
          onPress={handleSave}
          disabled={loading}
          style={({ pressed }) => ({
            backgroundColor: '#7C3AED', borderRadius: 12, paddingVertical: 14,
            alignItems: 'center', marginTop: 8, opacity: loading || pressed ? 0.75 : 1,
          })}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Aggiorna password</Text>
          }
        </Pressable>

        {success && (
          <Pressable onPress={() => router.back()} style={{ marginTop: 14, alignItems: 'center' }}>
            <Text style={{ color: '#A855F7', fontWeight: '700' }}>Torna alle impostazioni</Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
