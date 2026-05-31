import { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';
import { CITIES, INTERESTS_OPTIONS } from '@lets-night/shared';

function Field({ label, ...inputProps }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: '#64748B', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>{label}</Text>
      <TextInput
        placeholderTextColor="#4B5563"
        style={{
          backgroundColor: '#18181f', borderWidth: 1, borderColor: 'rgba(168,85,247,0.2)',
          borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
          color: '#fff', fontSize: 14,
        }}
        {...inputProps}
      />
    </View>
  );
}

export default function EditProfileScreen() {
  const { session } = useSession();
  const myId = session?.user?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [form, setForm] = useState({
    display_name: '',
    username: '',
    bio: '',
    city: 'Milano',
    interests: [],
  });
  const [originalUsername, setOriginalUsername] = useState('');

  useEffect(() => {
    async function load() {
      if (!myId) { setLoading(false); return; }
      const { data } = await supabase
        .from('profiles')
        .select('display_name, full_name, username, bio, city, interests')
        .eq('id', myId)
        .maybeSingle();
      if (data) {
        setForm({
          display_name: data.display_name || data.full_name || '',
          username: data.username || '',
          bio: data.bio || '',
          city: data.city || 'Milano',
          interests: data.interests || [],
        });
        setOriginalUsername(data.username || '');
      }
      setLoading(false);
    }
    load();
  }, [myId]);

  function update(key, value) {
    setForm(s => ({ ...s, [key]: value }));
    if (key === 'username') setUsernameError('');
  }
  function toggleInterest(t) {
    setForm(s => ({
      ...s,
      interests: s.interests.includes(t)
        ? s.interests.filter(x => x !== t)
        : [...s.interests, t],
    }));
  }

  async function save() {
    setError('');
    setUsernameError('');

    const username = form.username.trim().toLowerCase();
    if (username && !/^[a-z0-9_.]{3,20}$/.test(username)) {
      setUsernameError('Username: 3-20 caratteri, solo lettere, numeri, _ e .');
      return;
    }

    setSaving(true);
    // Check unicità username via RPC (RLS impedisce SELECT cross-user)
    if (username && username !== originalUsername.toLowerCase()) {
      const { data: available } = await supabase.rpc('check_username_available', { p_username: username });
      if (available === false) {
        setUsernameError('Username già in uso.');
        setSaving(false);
        return;
      }
    }

    const { error: err } = await supabase
      .from('profiles')
      .update({
        display_name: form.display_name.trim() || null,
        username: username || null,
        bio: form.bio.trim() || null,
        city: form.city,
        interests: form.interests,
      })
      .eq('id', myId);

    setSaving(false);
    if (err) {
      setError('Impossibile salvare: ' + err.message);
      return;
    }
    Alert.alert('Profilo aggiornato', 'Le modifiche sono state salvate.', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#09090f', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#A855F7" size="large" />
      </View>
    );
  }

  if (!myId) {
    return (
      <View style={{ flex: 1, backgroundColor: '#09090f', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Text style={{ color: '#fff' }}>Devi essere loggato.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#09090f' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: '#A855F7', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>Profilo</Text>
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900', marginBottom: 24 }}>Modifica</Text>

        {error ? (
          <View style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: 10, padding: 12, marginBottom: 14 }}>
            <Text style={{ color: '#fca5a5', fontSize: 13 }}>{error}</Text>
          </View>
        ) : null}

        <Field
          label="Display name"
          placeholder="Es. Mattia S."
          value={form.display_name}
          onChangeText={v => update('display_name', v)}
        />

        <Field
          label="Username (opzionale)"
          placeholder="mattia.s"
          value={form.username}
          onChangeText={v => update('username', v)}
          autoCapitalize="none"
        />
        {usernameError ? (
          <Text style={{ color: '#fca5a5', fontSize: 12, marginTop: -10, marginBottom: 12 }}>{usernameError}</Text>
        ) : null}

        <Field
          label="Bio"
          placeholder="Una breve descrizione di te..."
          value={form.bio}
          onChangeText={v => update('bio', v)}
          multiline
          numberOfLines={3}
        />

        {/* Città */}
        <Text style={{ color: '#64748B', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>Città</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 22 }}>
          {CITIES.map(c => (
            <Pressable
              key={c}
              onPress={() => update('city', c)}
              style={{
                flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
                backgroundColor: form.city === c ? '#7C3AED' : '#18181f',
                borderWidth: 1,
                borderColor: form.city === c ? '#7C3AED' : 'rgba(168,85,247,0.2)',
              }}
            >
              <Text style={{ color: form.city === c ? '#fff' : '#9CA3AF', fontWeight: form.city === c ? '700' : '500' }}>{c}</Text>
            </Pressable>
          ))}
        </View>

        {/* Interessi */}
        <Text style={{ color: '#64748B', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>Interessi nightlife</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 30 }}>
          {INTERESTS_OPTIONS.map(t => {
            const active = form.interests.includes(t);
            return (
              <Pressable
                key={t}
                onPress={() => toggleInterest(t)}
                style={{
                  paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14,
                  backgroundColor: active ? '#7C3AED' : '#18181f',
                  borderWidth: 1, borderColor: active ? '#7C3AED' : 'rgba(168,85,247,0.2)',
                }}
              >
                <Text style={{ color: active ? '#fff' : '#9CA3AF', fontSize: 12, fontWeight: active ? '700' : '500' }}>
                  {t}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={save}
          disabled={saving}
          style={({ pressed }) => ({
            backgroundColor: '#7C3AED', borderRadius: 12, paddingVertical: 14,
            alignItems: 'center', opacity: saving || pressed ? 0.75 : 1, marginTop: 4,
          })}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Salva modifiche</Text>}
        </Pressable>

        <Text style={{ color: '#64748B', fontSize: 11, textAlign: 'center', marginTop: 12 }}>
          Per modifiche all&apos;email contatta il supporto.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
