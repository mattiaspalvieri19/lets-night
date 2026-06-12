import { useState, useCallback, useRef } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert, Linking } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { formatDateFull, formatTime, todayLocal, daysBetweenLocal } from '@lets-night/shared';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

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
  const [denying, setDenying] = useState(false);
  const [myVenueIds, setMyVenueIds] = useState(null); // null=loading, []=nessuno, [...]=ok
  const scanningRef = useRef(false);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setActive(true);
    setResult(null);
    setScanning(false);
    scanningRef.current = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled || !session) return;
      const { data: vs } = await supabase
        .from('venues')
        .select('id')
        .eq('owner_id', session.user.id);
      if (cancelled) return;
      setMyVenueIds((vs || []).map(v => v.id));
    })();
    return () => { cancelled = true; setActive(false); };
  }, []));

  async function handleScan({ data: qrCode }) {
    if (scanningRef.current || result) return;
    if (myVenueIds === null) {
      Alert.alert('Caricamento', 'Stiamo verificando il tuo locale, riprova tra un istante.');
      return;
    }
    if (myVenueIds.length === 0) {
      Alert.alert('Nessun locale', 'Il tuo account non è associato ad alcun locale.');
      return;
    }
    scanningRef.current = true;
    setScanning(true);

    const { data: booking, error } = await supabase
      .from('bookings')
      .select('*, events(title, event_date, event_time, venue_id), profiles(full_name, birth_date), event_tables(people_count, max_people, collected, total_price, event_table_types(name))')
      .eq('qr_code', qrCode)
      .maybeSingle();

    if (error || !booking) {
      Alert.alert('QR non valido', 'Biglietto non trovato.');
      scanningRef.current = false;
      setScanning(false);
      return;
    }

    if (booking.status === 'cancelled') {
      const wasUsed = !!booking.checked_in;
      Alert.alert(
        wasUsed ? 'Biglietto rimborsato' : 'Prenotazione annullata',
        wasUsed
          ? 'Questo biglietto è stato annullato dopo l\'ingresso. Negare il rientro.'
          : 'Questo biglietto è stato annullato.'
      );
      scanningRef.current = false;
      setScanning(false);
      return;
    }

    if (!myVenueIds.includes(booking.events?.venue_id)) {
      scanningRef.current = false;
      setScanning(false);
      Alert.alert('Biglietto non valido', 'Questo QR appartiene a un evento di un altro locale.');
      return;
    }

    // Hard block per eventi fuori dalla finestra ±1 giorno (after-midnight grace).
    if (booking.events?.event_date) {
      const diff = Math.abs(daysBetweenLocal(booking.events.event_date, todayLocal()));
      if (diff > 1) {
        scanningRef.current = false;
        setScanning(false);
        Alert.alert('Biglietto fuori finestra', `Evento del ${formatDateFull(booking.events.event_date)} — non valido oggi.`);
        return;
      }
    }

    setResult(booking);
    scanningRef.current = false;
    setScanning(false);
  }

  async function handleCheckIn() {
    if (!result || result.checked_in) return;
    setCheckingIn(true);
    // Conditional update: vince solo il primo scanner; se un altro ha già marcato, no-op.
    const { data: updated, error } = await supabase
      .from('bookings')
      .update({ checked_in: true, checked_in_at: new Date().toISOString() })
      .eq('id', result.id)
      .eq('checked_in', false)
      .select('id, checked_in, checked_in_at')
      .maybeSingle();
    setCheckingIn(false);
    if (error) { Alert.alert('Errore', 'Check-in non riuscito. Riprova.'); console.error(error); return; }
    if (!updated) {
      // Un altro scanner ha vinto la race: ricarica per mostrare "GIÀ SCANNERIZZATO"
      const { data: fresh } = await supabase
        .from('bookings')
        .select('checked_in, checked_in_at')
        .eq('id', result.id)
        .maybeSingle();
      setResult(prev => ({ ...prev, checked_in: true, checked_in_at: fresh?.checked_in_at || prev.checked_in_at }));
      return;
    }
    setResult(prev => ({ ...prev, checked_in: true, checked_in_at: updated.checked_in_at }));
  }

  function handleDenyEntry() {
    if (!result || result.checked_in || denying) return;
    Alert.alert(
      'Negare l\'ingresso?',
      'La prenotazione verrà annullata e, se a pagamento, rimborsata automaticamente. Usa SOLO se non fai entrare la persona — non per chi semplicemente non si presenta.',
      [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Nega e rimborsa', style: 'destructive', onPress: doDenyEntry },
      ]
    );
  }

  async function doDenyEntry() {
    setDenying(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setDenying(false);
      Alert.alert('Sessione scaduta', 'Rieffettua il login.');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/stripe/refund-booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: result.id, accessToken: session.access_token, reason: 'denied_entry' }),
      });
      const json = await res.json();
      setDenying(false);
      if (!res.ok) {
        Alert.alert('Operazione non riuscita', json.error || 'Riprova.');
        return;
      }
      Alert.alert(
        'Ingresso negato',
        json.refunded
          ? 'Prenotazione annullata e rimborso avviato.'
          : 'Prenotazione annullata.'
      );
      setResult(null);
    } catch {
      setDenying(false);
      Alert.alert('Errore di connessione', 'Riprova tra poco.');
    }
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

  if (myVenueIds && myVenueIds.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: '#09090f', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
        <Text style={{ fontSize: 44, marginBottom: 14 }}>🏢</Text>
        <Text style={{ color: '#fff', fontSize: 19, fontWeight: '800', textAlign: 'center', marginBottom: 8 }}>Nessun locale associato</Text>
        <Text style={{ color: '#64748B', textAlign: 'center', lineHeight: 21 }}>
          Il tuo account business non ha un locale collegato. Contatta il supporto.
        </Text>
      </View>
    );
  }

  if (result) {
    const alreadyIn = result.checked_in;
    const today = todayLocal();
    const isTonight = result.events?.event_date === today;
    // Mostra snapshot_full_name se presente (resistente ai rename), altrimenti il full_name corrente.
    const displayName = result.snapshot_full_name || result.profiles?.full_name || 'Utente';
    const age = calcAge(result.profiles?.birth_date);
    const checkedInTime = result.checked_in_at
      ? new Date(result.checked_in_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
      : null;

    return (
      <View style={{ flex: 1, backgroundColor: '#09090f', justifyContent: 'center', paddingHorizontal: 24 }}>
        <View style={{ backgroundColor: '#111118', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: alreadyIn ? 'rgba(245,158,11,0.4)' : isTonight ? 'rgba(74,222,128,0.35)' : 'rgba(245,158,11,0.35)' }}>

          {alreadyIn ? (
            <View style={{ backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, marginBottom: 20, alignItems: 'center' }}>
              <Text style={{ color: '#FBBF24', fontWeight: '900', fontSize: 16 }}>⚠️ GIÀ SCANNERIZZATO</Text>
              <Text style={{ color: '#F59E0B', fontSize: 12, marginTop: 4, fontWeight: '600' }}>
                Rientro — verifica nome e cognome
              </Text>
              {checkedInTime && (
                <Text style={{ color: '#92400E', fontSize: 11, marginTop: 3 }}>
                  Prima entrata: {checkedInTime}
                </Text>
              )}
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 20, backgroundColor: isTonight ? 'rgba(74,222,128,0.1)' : 'rgba(245,158,11,0.1)', borderRadius: 10, paddingVertical: 10, borderWidth: 1, borderColor: isTonight ? 'rgba(74,222,128,0.25)' : 'rgba(245,158,11,0.3)' }}>
              <Text style={{ fontSize: 16 }}>{isTonight ? '✅' : '⚠️'}</Text>
              <Text style={{ color: isTonight ? '#4ADE80' : '#FBBF24', fontWeight: '800', fontSize: 14 }}>
                {isTonight ? 'Valido per stasera' : 'Evento in data diversa'}
              </Text>
            </View>
          )}

          <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900', textAlign: 'center', marginBottom: 10, letterSpacing: 0.3 }}>
            {displayName}
          </Text>

          {age != null && (
            <View style={{ alignSelf: 'center', backgroundColor: 'rgba(168,85,247,0.15)', borderWidth: 1, borderColor: 'rgba(168,85,247,0.4)', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 6, marginBottom: 20 }}>
              <Text style={{ color: '#A855F7', fontWeight: '900', fontSize: 20 }}>{age} anni</Text>
            </View>
          )}

          <View style={{ backgroundColor: '#18181f', borderRadius: 12, padding: 14, marginBottom: 16 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14, marginBottom: 4 }} numberOfLines={2}>{result.events?.title}</Text>
            <Text style={{ color: '#A855F7', fontSize: 13 }}>{formatDateFull(result.events?.event_date)} · {formatTime(result.events?.event_time)}</Text>
            {result.event_tables ? (
              <View style={{ marginTop: 10, backgroundColor: 'rgba(168,85,247,0.1)', borderRadius: 8, padding: 10 }}>
                <Text style={{ color: '#A855F7', fontWeight: '800', fontSize: 13 }}>
                  TAVOLO {result.event_tables.event_table_types?.name || ''}
                </Text>
                <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 3 }}>
                  {result.event_tables.people_count}/{result.event_tables.max_people} persone · raccolti {Number(result.event_tables.collected).toFixed(0)}/{Number(result.event_tables.total_price).toFixed(0)} €
                </Text>
                <Text style={{ color: '#64748B', fontSize: 12, marginTop: 2 }}>
                  Quota di questo ospite: {Number(result.total_price).toFixed(2).replace('.', ',')} €
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                <Text style={{ color: '#64748B', fontSize: 12 }}>{result.quantity} {result.quantity > 1 ? 'posti' : 'posto'}</Text>
                <Text style={{ color: '#9CA3AF', fontSize: 12 }}>{Number(result.total_price).toFixed(2).replace('.', ',')} €</Text>
              </View>
            )}
          </View>

          {alreadyIn ? (
            <View style={{ backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ color: '#FBBF24', fontWeight: '800', fontSize: 15 }}>Già scannerizzato — solo rientro</Text>
              <Text style={{ color: '#92400E', fontSize: 12, marginTop: 4 }}>Verifica visivamente che sia la stessa persona</Text>
            </View>
          ) : (
            <Pressable onPress={handleCheckIn} disabled={checkingIn || denying}
              style={({ pressed }) => ({ backgroundColor: '#4ADE80', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12, opacity: checkingIn || denying || pressed ? 0.7 : 1 })}
            >
              {checkingIn ? <ActivityIndicator color="#000" /> : <Text style={{ color: '#000', fontWeight: '900', fontSize: 16 }}>✓ Conferma ingresso</Text>}
            </Pressable>
          )}

          {!alreadyIn && (
            <Pressable onPress={handleDenyEntry} disabled={denying || checkingIn}
              style={({ pressed }) => ({ paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)', backgroundColor: 'rgba(239,68,68,0.08)', opacity: denying || checkingIn || pressed ? 0.7 : 1 })}
            >
              {denying ? <ActivityIndicator color="#F87171" /> : <Text style={{ color: '#F87171', fontWeight: '800', fontSize: 14 }}>✕ Nega ingresso e rimborsa</Text>}
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
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <View style={{ width: 220, height: 220, borderWidth: 2, borderColor: '#A855F7', borderRadius: 16, backgroundColor: 'transparent' }} />
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
