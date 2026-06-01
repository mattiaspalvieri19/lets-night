import { useState, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert, Linking } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { formatDateFull, formatTime } from '@lets-night/shared';

function calcAge(birthDate) {
  if (!birthDate) return null;
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age < 0 ? null : age;
}

export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [active, setActive] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [myVenueId, setMyVenueId] = useState(null);

  useFocusEffect(useCallback(() => {
    setActive(true);
    setResult(null);
    setScanning(false);
    async function loadVenue() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: v } = await supabase.from('venues').select('id').eq('owner_id', session.user.id).single();
      if (v) setMyVenueId(v.id);
    }
    loadVenue();
    return () => setActive(false);
  }, []));

  async function handleScan({ data: qrCode }) {
    if (scanning || result) return;
    if (!myVenueId) {
      Alert.alert('Caricamento', 'Stiamo verificando il tuo locale, riprova tra un istante.');
      return;
    }
    setScanning(true);

    const { data: booking, error } = await supabase
      .from('bookings')
      .select('*, events(title, event_date, event_time, venue_id), profiles(full_name, phone, birth_date)')
      .eq('qr_code', qrCode)
      .single();

    if (error || !booking) {
      Alert.alert('QR non valido', 'Nessuna prenotazione trovata per questo QR code.', );
      setScanning(false);
      return;
    }

    if (booking.status === 'cancelled') {
      Alert.alert('Prenotazione annullata', 'Questo biglietto è stato annullato.', );
      setScanning(false);
      return;
    }

    if (booking.events?.venue_id !== myVenueId) {
      setScanning(false);
      Alert.alert('Biglietto non valido', 'Questo QR appartiene a un evento di un altro locale.');
      return;
    }

    setResult(booking);
    setScanning(false);
  }

  async function handleCheckIn() {
    if (!result || result.checked_in) return;
    setCheckingIn(true);
    const { error } = await supabase.from('bookings').update({
      checked_in: true,
      checked_in_at: new Date().toISOString(),
    }).eq('id', result.id);
    setCheckingIn(false);
    if (error) { Alert.alert('Errore', error.message); return; }
    setResult(prev => ({ ...prev, checked_in: true }));
  }

  if (!permission) return <View style={{ flex: 1, backgroundColor: '#09090f' }} />;

  if (!permission.granted) {
    const canAsk = permission.canAskAgain;
    return (
      <View style={{ flex: 1, backgroundColor: '#09090f', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>📷</Text>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 8 }}>Fotocamera necessaria</Text>
        <Text style={{ color: '#64748B', textAlign: 'center', lineHeight: 22, marginBottom: 28 }}>
          {canAsk
            ? 'Per scannerizzare i QR code dei biglietti è necessario l\'accesso alla fotocamera.'
            : 'Permesso negato. Apri le Impostazioni e attiva la fotocamera per Let\'s Night.'}
        </Text>
        <Pressable
          onPress={() => canAsk ? requestPermission() : Linking.openSettings()}
          style={{ backgroundColor: '#7C3AED', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12, width: '100%' }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15, textAlign: 'center' }}>
            {canAsk ? 'Concedi accesso' : 'Apri Impostazioni'}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (result) {
    const alreadyIn = result.checked_in;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const isTonight = result.events?.event_date === todayStr;
    const age = calcAge(result.profiles?.birth_date);

    return (
      <View style={{ flex: 1, backgroundColor: '#09090f', justifyContent: 'center', paddingHorizontal: 24 }}>
        <View style={{ backgroundColor: '#111118', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: alreadyIn ? 'rgba(74,222,128,0.25)' : isTonight ? 'rgba(168,85,247,0.25)' : 'rgba(245,158,11,0.35)' }}>

          {/* Validità serata */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 20, backgroundColor: isTonight ? 'rgba(74,222,128,0.1)' : 'rgba(245,158,11,0.1)', borderRadius: 10, paddingVertical: 10, borderWidth: 1, borderColor: isTonight ? 'rgba(74,222,128,0.25)' : 'rgba(245,158,11,0.3)' }}>
            <Text style={{ fontSize: 16 }}>{isTonight ? '✅' : '⚠️'}</Text>
            <Text style={{ color: isTonight ? '#4ADE80' : '#FBBF24', fontWeight: '800', fontSize: 14 }}>
              {isTonight ? 'Valido per stasera' : 'Evento in data diversa'}
            </Text>
          </View>

          {/* Nome */}
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 8 }}>
            {result.profiles?.full_name || 'Utente'}
          </Text>

          {/* Età */}
          {age != null && (
            <View style={{ alignSelf: 'center', backgroundColor: 'rgba(168,85,247,0.15)', borderWidth: 1, borderColor: 'rgba(168,85,247,0.4)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 5, marginBottom: 6 }}>
              <Text style={{ color: '#A855F7', fontWeight: '800', fontSize: 18 }}>{age} anni</Text>
            </View>
          )}

          {/* Telefono */}
          {result.profiles?.phone ? (
            <Text style={{ color: '#64748B', fontSize: 13, textAlign: 'center', marginBottom: 20 }}>{result.profiles.phone}</Text>
          ) : <View style={{ marginBottom: 20 }} />}

          {/* Dati evento */}
          <View style={{ backgroundColor: '#18181f', borderRadius: 12, padding: 14, marginBottom: 16 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14, marginBottom: 4 }} numberOfLines={2}>{result.events?.title}</Text>
            <Text style={{ color: '#A855F7', fontSize: 13 }}>{formatDateFull(result.events?.event_date)} · {formatTime(result.events?.event_time)}</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              <Text style={{ color: '#64748B', fontSize: 12 }}>{result.quantity} {result.quantity > 1 ? 'posti' : 'posto'}</Text>
              <Text style={{ color: '#9CA3AF', fontSize: 12 }}>EUR {result.total_price}</Text>
            </View>
          </View>

          {alreadyIn ? (
            <View style={{ backgroundColor: 'rgba(74,222,128,0.12)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ color: '#4ADE80', fontWeight: '800', fontSize: 16 }}>✓ Già entrato</Text>
            </View>
          ) : (
            <Pressable onPress={handleCheckIn} disabled={checkingIn}
              style={({ pressed }) => ({ backgroundColor: '#4ADE80', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12, opacity: checkingIn || pressed ? 0.7 : 1 })}
            >
              {checkingIn ? <ActivityIndicator color="#000" /> : <Text style={{ color: '#000', fontWeight: '900', fontSize: 16 }}>✓ Conferma ingresso</Text>}
            </Pressable>
          )}

          <Pressable onPress={() => setResult(null)} style={({ pressed }) => ({ paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(168,85,247,0.3)', opacity: pressed ? 0.7 : 1 })}>
            <Text style={{ color: '#A855F7', fontWeight: '700', fontSize: 14 }}>Scansiona altro</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#09090f' }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 }}>
        <Pressable
          onPress={() => router.push('/(business)')}
          hitSlop={10}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12, opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={{ color: '#A855F7', fontSize: 16 }}>‹</Text>
          <Text style={{ color: '#A855F7', fontSize: 13, fontWeight: '600' }}>Dashboard</Text>
        </Pressable>
        <Text style={{ color: '#A855F7', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>Ingresso</Text>
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900' }}>Scanner QR</Text>
        <Text style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>Inquadra il QR code del biglietto</Text>
      </View>

      <View style={{ flex: 1, margin: 20, borderRadius: 20, overflow: 'hidden', position: 'relative' }}>
        {active && (
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={scanning ? undefined : handleScan}
          />
        )}
        {/* Viewfinder overlay */}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <View style={{ width: 220, height: 220, borderWidth: 2, borderColor: '#A855F7', borderRadius: 16, backgroundColor: 'transparent' }}>
            {[['top-0 left-0', 0, 0], ['top-0 right-0', 0, null], ['bottom-0 left-0', null, 0], ['bottom-0 right-0', null, null]].map((_, i) => (
              <View key={i} />
            ))}
          </View>
        </View>
        {scanning && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#A855F7" size="large" />
            <Text style={{ color: '#fff', marginTop: 12, fontSize: 14 }}>Verifica biglietto...</Text>
          </View>
        )}
      </View>

      <View style={{ paddingHorizontal: 20, paddingBottom: 40, alignItems: 'center' }}>
        <Text style={{ color: '#64748B', fontSize: 13, textAlign: 'center', lineHeight: 20 }}>
          Inquadra il QR code mostrato nell&apos;app del cliente.{'\n'}Il check-in viene registrato automaticamente.
        </Text>
      </View>
    </View>
  );
}
