import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform, Alert, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';
import { CITIES, INTERESTS_OPTIONS } from '@lets-night/shared';

function Field({ label, ...inputProps }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: '#64748B', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>
        {label}
      </Text>
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

function initialOf(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
}

export default function EditProfileScreen() {
  const { session } = useSession();
  const myId = session?.user?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState('');
  const [usernameError, setUsernameError] = useState('');

  const [form, setForm] = useState({
    display_name: '',
    username: '',
    bio: '',
    phone: '',
    gender: null,
    city: 'Milano',
    interests: [],
  });
  const [birthDate, setBirthDate] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [originalUsername, setOriginalUsername] = useState('');
  const [originalPhone, setOriginalPhone] = useState('');

  useEffect(() => {
    async function load() {
      if (!myId) { setLoading(false); return; }
      const { data } = await supabase
        .from('profiles')
        .select('display_name, full_name, username, bio, city, interests, phone, gender, birth_date, avatar_url')
        .eq('id', myId)
        .maybeSingle();
      if (data) {
        setForm({
          display_name: data.display_name || data.full_name || '',
          username: data.username || '',
          bio: data.bio || '',
          phone: data.phone || '',
          gender: data.gender || null,
          city: data.city || 'Milano',
          interests: data.interests || [],
        });
        setOriginalUsername(data.username || '');
        setOriginalPhone(data.phone || '');
        setBirthDate(data.birth_date || null);
        setAvatarUrl(data.avatar_url || null);
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

  async function pickAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permesso negato', 'Consenti l\'accesso alla galleria nelle impostazioni del telefono.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;

    setUploadingAvatar(true);
    try {
      const asset = result.assets[0];
      const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase();
      const path = `${myId}/avatar.${ext}`;

      const response = await fetch(asset.uri);
      const blob = await response.blob();

      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { contentType: `image/${ext}`, upsert: true });

      if (uploadErr) {
        Alert.alert('Errore', 'Impossibile caricare la foto. Riprova.');
        return;
      }

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);

      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', myId);
      setAvatarUrl(`${publicUrl}?t=${Date.now()}`);
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function save() {
    setError('');
    setUsernameError('');

    const username = form.username.trim().toLowerCase();
    if (username && !/^[a-z0-9_.]{3,20}$/.test(username)) {
      setUsernameError('3-20 caratteri, solo lettere, numeri, _ e .');
      return;
    }

    const phone = form.phone.trim();
    if (phone && !/^\+?[\d\s\-()]{7,20}$/.test(phone)) {
      setError('Numero di telefono non valido.');
      return;
    }

    setSaving(true);

    if (username && username !== originalUsername.toLowerCase()) {
      const { data: avail } = await supabase.rpc('check_username_available', { p_username: username });
      if (avail === false) {
        setUsernameError('Username già in uso.');
        setSaving(false);
        return;
      }
    }

    if (phone && phone !== originalPhone) {
      const { data: avail, error: rpcErr } = await supabase.rpc('check_phone_available', { p_phone: phone });
      if (rpcErr || avail == null) {
        setError('Verifica telefono non riuscita. Riprova.');
        setSaving(false);
        return;
      }
      if (avail === false) {
        setError('Numero di telefono già associato a un altro account.');
        setSaving(false);
        return;
      }
    }

    const { error: err } = await supabase.from('profiles').update({
      display_name: form.display_name.trim() || null,
      username: username || null,
      bio: form.bio.trim() || null,
      phone: phone || null,
      gender: form.gender || null,
      city: form.city,
      interests: form.interests,
    }).eq('id', myId);

    setSaving(false);
    if (err) { setError('Impossibile salvare: ' + err.message); return; }
    Alert.alert('Salvato', 'Le modifiche sono state salvate.', [
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

  const displayName = form.display_name || '?';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#09090f' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Avatar */}
        <View style={{ alignItems: 'center', marginBottom: 28 }}>
          <Pressable onPress={pickAvatar} disabled={uploadingAvatar}>
            <View style={{ position: 'relative' }}>
              {avatarUrl ? (
                <Image
                  source={{ uri: avatarUrl }}
                  style={{ width: 90, height: 90, borderRadius: 45, borderWidth: 2, borderColor: 'rgba(168,85,247,0.5)' }}
                />
              ) : (
                <View style={{
                  width: 90, height: 90, borderRadius: 45,
                  backgroundColor: 'rgba(168,85,247,0.18)',
                  borderWidth: 2, borderColor: 'rgba(168,85,247,0.4)',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ color: '#A855F7', fontSize: 38, fontWeight: '900' }}>
                    {initialOf(displayName)}
                  </Text>
                </View>
              )}
              <View style={{
                position: 'absolute', bottom: 0, right: 0,
                width: 26, height: 26, borderRadius: 13,
                backgroundColor: '#7C3AED',
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 2, borderColor: '#09090f',
              }}>
                {uploadingAvatar
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ color: '#fff', fontSize: 12 }}>✎</Text>
                }
              </View>
            </View>
          </Pressable>
          <Text style={{ color: '#64748B', fontSize: 11, marginTop: 8 }}>
            Tocca per cambiare foto
          </Text>
        </View>

        {error ? (
          <View style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: 10, padding: 12, marginBottom: 14 }}>
            <Text style={{ color: '#fca5a5', fontSize: 13 }}>{error}</Text>
          </View>
        ) : null}

        <Field
          label="Nome visualizzato"
          placeholder="Es. Mattia S."
          value={form.display_name}
          onChangeText={v => update('display_name', v)}
        />

        <View style={{ marginBottom: 16 }}>
          <Field
            label="Username (opzionale)"
            placeholder="mattia.s"
            value={form.username}
            onChangeText={v => update('username', v)}
            autoCapitalize="none"
          />
          {usernameError ? (
            <Text style={{ color: '#fca5a5', fontSize: 12, marginTop: -10, marginBottom: 8 }}>{usernameError}</Text>
          ) : null}
        </View>

        <Field
          label="Bio"
          placeholder="Una breve descrizione di te..."
          value={form.bio}
          onChangeText={v => update('bio', v)}
          multiline
          numberOfLines={3}
          style={{ minHeight: 80, textAlignVertical: 'top' }}
        />

        <Field
          label="Telefono (opzionale)"
          placeholder="+39 333 000 0000"
          value={form.phone}
          onChangeText={v => update('phone', v)}
          keyboardType="phone-pad"
        />

        {/* Sesso */}
        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: '#64748B', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>
            Sesso
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {[{ v: 'M', l: 'Uomo' }, { v: 'F', l: 'Donna' }, { v: 'X', l: 'Altro' }].map(g => (
              <Pressable
                key={g.v}
                onPress={() => update('gender', form.gender === g.v ? null : g.v)}
                style={{
                  flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
                  backgroundColor: form.gender === g.v ? '#7C3AED' : '#18181f',
                  borderWidth: 1,
                  borderColor: form.gender === g.v ? '#7C3AED' : 'rgba(168,85,247,0.2)',
                }}
              >
                <Text style={{ color: form.gender === g.v ? '#fff' : '#9CA3AF', fontWeight: '600' }}>
                  {g.l}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Data di nascita — read only */}
        {birthDate ? (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ color: '#64748B', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>
              Data di nascita
            </Text>
            <View style={{
              backgroundColor: '#18181f', borderWidth: 1, borderColor: 'rgba(168,85,247,0.1)',
              borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
              flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <Text style={{ color: '#9CA3AF', fontSize: 14 }}>
                {new Date(birthDate + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })}
              </Text>
              <Text style={{ color: '#4B5563', fontSize: 11 }}>non modificabile</Text>
            </View>
          </View>
        ) : null}

        {/* Città — nascosta in modalità single-city */}
        {CITIES.length > 1 && (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ color: '#64748B', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>
              Città
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
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
                  <Text style={{ color: form.city === c ? '#fff' : '#9CA3AF', fontWeight: form.city === c ? '700' : '500' }}>
                    {c}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Interessi */}
        <View style={{ marginBottom: 28 }}>
          <Text style={{ color: '#64748B', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>
            Interessi nightlife
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
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
        </View>

        <Pressable
          onPress={save}
          disabled={saving}
          style={({ pressed }) => ({
            backgroundColor: '#7C3AED', borderRadius: 12, paddingVertical: 14,
            alignItems: 'center', opacity: saving || pressed ? 0.75 : 1,
          })}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Salva modifiche</Text>
          }
        </Pressable>

        <Text style={{ color: '#4B5563', fontSize: 11, textAlign: 'center', marginTop: 12 }}>
          Email non modificabile. Per cambiarla contatta il supporto.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
