import { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, Image, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { uploadPickedImage, imageExt } from '../../../lib/uploadImage';
import { CATS_NO_TUTTI, CITIES, COLORS, FONT_FAMILY } from '@lets-night/shared';

const MAX_COVER_MB = 5;

function safeUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return ['http:', 'https:'].includes(u.protocol) ? u.toString() : '';
  } catch { return ''; }
}

function normInstagram(v) {
  if (!v) return '';
  return v.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/+$/, '');
}

export default function EditVenue() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [venue, setVenue] = useState(null);
  const [coverUrl, setCoverUrl] = useState('');
  const [form, setForm] = useState({
    name: '', description: '', category: 'Discoteca',
    city: 'Milano', zona: '', address: '',
    phone: '', email: '', website: '', instagram: '',
  });
  const dirty = useRef(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/auth/login'); return; }
      const { data: v } = await supabase.from('venues').select('*').eq('owner_id', session.user.id).maybeSingle();
      if (!v) { router.replace('/(business)'); return; }
      setVenue(v);
      setForm({
        name: v.name || '',
        description: v.description || '',
        category: v.category || 'Discoteca',
        city: v.city || 'Milano',
        zona: v.zona || '',
        address: v.address || '',
        phone: v.phone || '',
        email: v.email || '',
        website: v.website || '',
        instagram: v.instagram || '',
      });
      setCoverUrl(v.cover_image || '');
      setLoading(false);
    })();
  }, []);

  function setField(k, val) {
    dirty.current = true;
    setForm(s => ({ ...s, [k]: val }));
  }

  async function pickCover() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permesso negato', 'Consenti l\'accesso alla galleria nelle impostazioni del telefono.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 10],
      quality: 0.75,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > MAX_COVER_MB * 1024 * 1024) {
      Alert.alert('Foto troppo grande', `Max ${MAX_COVER_MB}MB.`);
      return;
    }

    setUploading(true);
    try {
      const path = `${venue.id}/cover.${imageExt(asset)}`;
      const publicUrl = await uploadPickedImage('venue-covers', path, asset);
      const versioned = `${publicUrl}?v=${Date.now()}`;
      const { error: upErr } = await supabase.from('venues').update({ cover_image: versioned }).eq('id', venue.id);
      if (upErr) {
        Alert.alert('Errore', 'Foto caricata ma non salvata.');
        return;
      }
      setCoverUrl(versioned);
    } catch (e) {
      console.error('Errore upload cover:', e);
      Alert.alert('Errore', 'Impossibile caricare la foto. Riprova.');
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (saving) return;
    if (!form.name.trim()) { Alert.alert('Manca il nome', 'Il nome del locale è obbligatorio.'); return; }

    const cleanWebsite = form.website ? safeUrl(form.website) : '';
    if (form.website && !cleanWebsite) {
      Alert.alert('Sito non valido', 'Inserisci un URL http o https valido.');
      return;
    }

    setSaving(true);
    const patch = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      category: form.category,
      city: form.city,
      zona: form.zona.trim() || null,
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      website: cleanWebsite || null,
      instagram: normInstagram(form.instagram) || null,
    };
    const { error: upErr } = await supabase.from('venues').update(patch).eq('id', venue.id);
    setSaving(false);
    if (upErr) {
      Alert.alert('Errore', 'Salvataggio fallito. Riprova.');
      console.error(upErr);
      return;
    }
    dirty.current = false;
    Alert.alert('Salvato', 'Le modifiche sono attive.', [{ text: 'OK', onPress: () => router.back() }]);
  }

  function handleBack() {
    if (!dirty.current) { router.back(); return; }
    Alert.alert(
      'Modifiche non salvate',
      'Vuoi uscire senza salvare?',
      [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Esci', style: 'destructive', onPress: () => router.back() },
      ],
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={COLORS.brand} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: COLORS.borderSubtle, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={handleBack} hitSlop={10}>
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </View>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.brand, fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' }}>Modifica</Text>
          <Text style={{ fontFamily: FONT_FAMILY.displayHeavy, color: '#fff', fontSize: 18 }}>Il tuo locale</Text>
        </View>
        <Pressable onPress={save} disabled={saving} hitSlop={6}
          style={({ pressed }) => ({ opacity: saving || pressed ? 0.5 : 1 })}
        >
          {saving ? <ActivityIndicator color={COLORS.textPrimary} size="small" /> : <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 16 }}>Salva</Text>}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        {/* Cover */}
        <Text style={Styles.sectionLabel}>Foto di copertina</Text>
        <Pressable onPress={pickCover} disabled={uploading} style={{
          aspectRatio: 16/10, backgroundColor: COLORS.bgElev3, borderRadius: 14, overflow: 'hidden',
          borderWidth: 1, borderColor: COLORS.borderSubtle, marginBottom: 22,
          alignItems: 'center', justifyContent: 'center',
        }}>
          {coverUrl ? (
            <Image source={{ uri: coverUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          ) : (
            <View style={{ alignItems: 'center' }}>
              <Ionicons name="image-outline" size={36} color={COLORS.textMuted} />
              <Text style={{ color: COLORS.textMuted, marginTop: 8, fontSize: 13 }}>Tocca per scegliere una foto</Text>
            </View>
          )}
          {uploading && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={COLORS.brand} />
            </View>
          )}
        </Pressable>

        {/* Nome */}
        <FieldLabel label="Nome" required />
        <TextInput style={Styles.input} value={form.name} onChangeText={t => setField('name', t)} maxLength={80} placeholder="Nome del locale" placeholderTextColor={COLORS.textDisabled} />

        {/* Descrizione */}
        <FieldLabel label="Descrizione" />
        <TextInput
          style={[Styles.input, { minHeight: 110, textAlignVertical: 'top' }]}
          value={form.description}
          onChangeText={t => setField('description', t)}
          maxLength={1000}
          multiline
          placeholder="Racconta il tuo locale: atmosfera, musica, cosa lo rende unico..."
          placeholderTextColor={COLORS.textDisabled}
        />
        <Text style={{ color: COLORS.textMuted, fontSize: 11, textAlign: 'right', marginBottom: 14 }}>{form.description.length}/1000</Text>

        {/* Categoria */}
        <FieldLabel label="Categoria" required />
        <ChipRow value={form.category} options={CATS_NO_TUTTI} onChange={v => setField('category', v)} />

        {/* Città — nascosta in modalità single-city */}
        {CITIES.length > 1 && (
          <>
            <FieldLabel label="Città" required />
            <ChipRow value={form.city} options={CITIES} onChange={v => setField('city', v)} />
          </>
        )}

        {/* Zona */}
        <FieldLabel label="Zona" />
        <TextInput style={Styles.input} value={form.zona} onChangeText={t => setField('zona', t)} maxLength={50} placeholder="Navigli, Brera..." placeholderTextColor={COLORS.textDisabled} />

        {/* Indirizzo */}
        <FieldLabel label="Indirizzo" />
        <TextInput style={Styles.input} value={form.address} onChangeText={t => setField('address', t)} maxLength={120} placeholder="Via Tortona 1" placeholderTextColor={COLORS.textDisabled} />

        <Text style={[Styles.sectionLabel, { marginTop: 18 }]}>Contatti</Text>

        <FieldLabel label="Telefono" />
        <TextInput style={Styles.input} value={form.phone} onChangeText={t => setField('phone', t)} keyboardType="phone-pad" maxLength={30} placeholder="+39 ..." placeholderTextColor={COLORS.textDisabled} />

        <FieldLabel label="Email" />
        <TextInput style={Styles.input} value={form.email} onChangeText={t => setField('email', t)} keyboardType="email-address" autoCapitalize="none" maxLength={120} placeholder="info@locale.it" placeholderTextColor={COLORS.textDisabled} />

        <FieldLabel label="Sito web" />
        <TextInput style={Styles.input} value={form.website} onChangeText={t => setField('website', t)} keyboardType="url" autoCapitalize="none" maxLength={200} placeholder="https://..." placeholderTextColor={COLORS.textDisabled} />

        <FieldLabel label="Instagram" />
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bgElev3, borderRadius: 10, borderWidth: 1, borderColor: COLORS.borderSubtle, marginBottom: 14 }}>
          <Text style={{ color: COLORS.textMuted, paddingLeft: 14 }}>@</Text>
          <TextInput
            style={[Styles.input, { flex: 1, marginBottom: 0, backgroundColor: 'transparent', borderWidth: 0 }]}
            value={form.instagram}
            onChangeText={t => setField('instagram', t)}
            autoCapitalize="none"
            maxLength={50}
            placeholder="nome_locale"
            placeholderTextColor={COLORS.textDisabled}
          />
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function FieldLabel({ label, required }) {
  return (
    <Text style={{ color: COLORS.textSecondary, fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 2 }}>
      {label}{required ? <Text style={{ color: COLORS.danger }}> *</Text> : null}
    </Text>
  );
}

function ChipRow({ value, options, onChange }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
      {options.map(opt => {
        const active = value === opt;
        return (
          <Pressable key={opt} onPress={() => onChange(opt)} style={{
            paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18,
            backgroundColor: active ? COLORS.brandStrong : COLORS.bgElev3,
            borderWidth: 1, borderColor: active ? COLORS.brandStrong : COLORS.borderSubtle,
          }}>
            <Text style={{ color: active ? '#fff' : COLORS.textSecondary, fontSize: 13, fontWeight: active ? '700' : '500' }}>{opt}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const Styles = {
  sectionLabel: { color: COLORS.brand, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10, fontWeight: '700' },
  input: {
    backgroundColor: COLORS.bgElev3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    color: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 14,
  },
};
