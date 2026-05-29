import { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, BackHandler } from 'react-native';
import { Link, router, Stack } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { CATS_NO_TUTTI, CITIES } from '@lets-night/shared';

export default function BusinessRegisterScreen() {
  const [form, setForm] = useState({
    venueName: '',
    category: 'Discoteca',
    city: 'Milano',
    zona: '',
    address: '',
    phone: '',
    description: '',
    ownerName: '',
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  function update(field) {
    return (v) => setForm(f => ({ ...f, [field]: v }));
  }

  async function handleSubmit() {
    if (loading) return;
    setError('');
    if (!form.venueName || !form.zona || !form.phone || !form.ownerName || !form.email || !form.password) {
      setError('Compila tutti i campi obbligatori.');
      return;
    }
    if (form.password.length < 6) {
      setError('La password deve essere di almeno 6 caratteri.');
      return;
    }
    setLoading(true);

    const { error: authError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        emailRedirectTo: 'letsnight://auth/callback',
        data: {
          full_name: form.ownerName,
          role: 'business',
          phone: form.phone,
          city: form.city,
          venue_name: form.venueName,
          venue_category: form.category,
          venue_city: form.city,
          venue_zona: form.zona,
          venue_address: form.address,
          venue_phone: form.phone,
          venue_description: form.description,
        },
      },
    });
    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
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
      <View style={{ flex: 1, backgroundColor: '#09090f', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <Stack.Screen options={{ gestureEnabled: false, headerBackVisible: false }} />
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(168,85,247,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <Text style={{ color: '#A855F7', fontSize: 28 }}>✓</Text>
        </View>
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 12 }}>
          Richiesta inviata
        </Text>
        <Text style={{ color: '#9CA3AF', textAlign: 'center', lineHeight: 22, marginBottom: 8 }}>
          Controlla la tua email{'\n'}
          <Text style={{ color: '#fff', fontWeight: '700' }}>{form.email}</Text>
        </Text>
        <Text style={{ color: '#64748B', fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 32 }}>
          Clicca il link di conferma. Il team Let&apos;s Night verificherà il tuo locale entro <Text style={{ color: '#fff' }}>24-48 ore</Text>.
        </Text>
        <Pressable onPress={() => router.replace('/auth/login')}>
          <Text style={{ color: '#A855F7', fontWeight: '700' }}>Vai al login</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#09090f' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={{ paddingHorizontal: 24, paddingTop: 40 }}>

          <Text style={{ color: '#A855F7', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>Business</Text>
          <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900', marginBottom: 6 }}>Registra il tuo locale</Text>
          <Text style={{ color: '#64748B', fontSize: 14, lineHeight: 20, marginBottom: 28 }}>
            Compila i dati. Ti contatteremo entro 24 ore per attivare il tuo account.
          </Text>

          {error ? (
            <View style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: 10, padding: 12, marginBottom: 16 }}>
              <Text style={{ color: '#fca5a5', fontSize: 13 }}>{error}</Text>
            </View>
          ) : null}

          {/* Sezione locale */}
          <Text style={{ color: '#64748B', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 }}>Dati del locale</Text>

          <Field label="Nome del locale *" value={form.venueName} onChange={update('venueName')} placeholder="Es. Amnesia Club" />

          <Text style={{ color: '#64748B', fontSize: 12, marginBottom: 8, marginTop: 6 }}>Categoria</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {CATS_NO_TUTTI.map(c => (
                <Pressable key={c} onPress={() => update('category')(c)}
                  style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: form.category === c ? '#7C3AED' : '#18181f', borderWidth: 1, borderColor: form.category === c ? '#7C3AED' : 'rgba(168,85,247,0.2)' }}>
                  <Text style={{ color: form.category === c ? '#fff' : '#9CA3AF', fontSize: 13 }}>{c}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <Text style={{ color: '#64748B', fontSize: 12, marginBottom: 8 }}>Città</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
            {CITIES.map(c => (
              <Pressable key={c} onPress={() => update('city')(c)}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: form.city === c ? '#7C3AED' : '#18181f', borderWidth: 1, borderColor: form.city === c ? '#7C3AED' : 'rgba(168,85,247,0.2)' }}>
                <Text style={{ color: form.city === c ? '#fff' : '#9CA3AF', fontWeight: form.city === c ? '700' : '500' }}>{c}</Text>
              </Pressable>
            ))}
          </View>

          <Field label="Zona *" value={form.zona} onChange={update('zona')} placeholder="Es. Navigli, Trastevere" />
          <Field label="Indirizzo" value={form.address} onChange={update('address')} placeholder="Via, numero civico" />
          <Field label="Telefono locale *" value={form.phone} onChange={update('phone')} placeholder="+39 02..." keyboardType="phone-pad" />
          <Field label="Descrizione breve" value={form.description} onChange={update('description')} placeholder="Cosa rende speciale il tuo locale?" multiline />

          {/* Sezione account */}
          <Text style={{ color: '#64748B', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12, marginTop: 16 }}>Account di accesso</Text>

          <Field label="Nome e cognome titolare *" value={form.ownerName} onChange={update('ownerName')} placeholder="Mario Rossi" />
          <Field label="Email *" value={form.email} onChange={update('email')} placeholder="info@tuolocale.it" keyboardType="email-address" autoCapitalize="none" />
          <Field label="Password *" value={form.password} onChange={update('password')} placeholder="Almeno 6 caratteri" secureTextEntry />

          <Pressable onPress={handleSubmit} disabled={loading}
            style={({ pressed }) => ({ backgroundColor: '#7C3AED', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 12, opacity: loading || pressed ? 0.7 : 1 })}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Invia richiesta</Text>}
          </Pressable>

          <Text style={{ color: '#64748B', fontSize: 12, textAlign: 'center', marginTop: 16, lineHeight: 18 }}>
            La tua richiesta verrà verificata manualmente entro 24 ore.
          </Text>

          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24, gap: 4 }}>
            <Text style={{ color: '#64748B' }}>Hai già un account?</Text>
            <Link href="/auth/login"><Text style={{ color: '#A855F7', fontWeight: '600' }}> Accedi</Text></Link>
          </View>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, value, onChange, placeholder, keyboardType, secureTextEntry, autoCapitalize, multiline }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: '#64748B', fontSize: 12, marginBottom: 6 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#4B5563"
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        style={{ backgroundColor: '#18181f', borderWidth: 1, borderColor: 'rgba(168,85,247,0.2)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 14, minHeight: multiline ? 80 : undefined, textAlignVertical: multiline ? 'top' : 'center' }}
      />
    </View>
  );
}
