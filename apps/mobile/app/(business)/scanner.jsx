import { useState, useCallback, useRef } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert, Linking, Image } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { API_URL } from '../../lib/apiUrl';
import { formatDateFull, formatTime } from '@lets-night/shared';

function initials(name) {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase())
    .join('');
}

// Esiti dell'endpoint che si chiudono con un Alert e tornano alla camera.
const ALERTS = {
  wrong_venue: ['QR di un altro locale', 'Questo QR code non è di questo locale: appartiene a un evento di un altro locale.'],
  not_found: ['QR non valido', 'Biglietto non trovato.'],
  cancelled: ['Prenotazione annullata', 'Questo biglietto è stato annullato.'],
  refunded: ['Biglietto rimborsato', 'Ingresso negato e rimborsato: non è valido.'],
  refunded_after_entry: ['Biglietto rimborsato', 'Annullato dopo l\'ingresso: negare il rientro.'],
  no_venue: ['Nessun locale', 'Il tuo account non è associato ad alcun locale.'],
};

export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [active, setActive] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null); // { status, booking, justEnteredNow }
  const [denying, setDenying] = useState(false);
  const [hasVenue, setHasVenue] = useState(null); // null=loading, false=nessuno, true=ok
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
      setHasVenue((vs || []).length > 0);
    })();
    return () => { cancelled = true; setActive(false); };
  }, []));

  async function handleScan({ data: qrCode }) {
    if (scanningRef.current || result) return;
    if (hasVenue === null) {
      Alert.alert('Caricamento', 'Stiamo verificando il tuo locale, riprova tra un istante.');
      return;
    }
    if (hasVenue === false) {
      Alert.alert('Nessun locale', 'Il tuo account non è associato ad alcun locale.');
      return;
    }
    scanningRef.current = true;
    setScanning(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { Alert.alert('Sessione scaduta', 'Rieffettua il login.'); return; }

      const res = await fetch(`${API_URL}/api/scan/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrCode, accessToken: session.access_token }),
      });
      const json = await res.json();

      if (!res.ok) {
        Alert.alert('Verifica non riuscita', json.error || 'Riprova.');
        return;
      }
      if (json.status === 'wrong_night') {
        setResult({ status: 'wrong_night', booking: json.booking, justEnteredNow: false });
        return;
      }
      if (json.status === 'ok') {
        const b = json.booking;
        if (b.checkedIn) {
          // già scannerizzato prima → è un rientro, nessun nuovo check-in
          setResult({ status: 'ok', booking: b, justEnteredNow: false });
        } else {
          // primo scan valido → check-in automatico immediato (scan = entrato)
          const ci = await performCheckIn(b.bookingId);
          setResult({
            status: 'ok',
            booking: { ...b, checkedIn: true, checkedInAt: ci.checkedInAt },
            justEnteredNow: ci.justNow,
          });
        }
        return;
      }
      const [title, msg] = ALERTS[json.status] || ['QR non valido', 'Esito non riconosciuto.'];
      Alert.alert(title, msg);
    } catch {
      Alert.alert('Errore di connessione', 'Controlla la rete e riprova.');
    } finally {
      scanningRef.current = false;
      setScanning(false);
    }
  }

  // Check-in automatico: conditional update, vince solo il primo scanner. Ritorna
  // { checkedInAt, justNow } — justNow=false se qualcun altro l'aveva già marcato.
  async function performCheckIn(bookingId) {
    const { data: updated, error } = await supabase
      .from('bookings')
      .update({ checked_in: true, checked_in_at: new Date().toISOString() })
      .eq('id', bookingId)
      .eq('checked_in', false)
      .select('checked_in_at')
      .maybeSingle();
    if (error) {
      console.error(error);
      const { data: fresh } = await supabase.from('bookings').select('checked_in_at').eq('id', bookingId).maybeSingle();
      return { checkedInAt: fresh?.checked_in_at || null, justNow: false };
    }
    if (updated) return { checkedInAt: updated.checked_in_at, justNow: true };
    const { data: fresh } = await supabase.from('bookings').select('checked_in_at').eq('id', bookingId).maybeSingle();
    return { checkedInAt: fresh?.checked_in_at || null, justNow: false };
  }

  function handleDenyEntry() {
    if (!result || denying || result.status !== 'ok') return;
    Alert.alert(
      'Rifiutare l\'ingresso?',
      'Con lo scan la persona risulta già entrata. Se la rifiuti, la prenotazione viene annullata e rimborsata e la fee resta a carico del locale. Usa SOLO se NON la fai entrare davvero — non per chi semplicemente non si presenta.',
      [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Rifiuta e rimborsa', style: 'destructive', onPress: doDenyEntry },
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
        body: JSON.stringify({ bookingId: result.booking.bookingId, accessToken: session.access_token, reason: 'denied_entry' }),
      });
      const json = await res.json();
      setDenying(false);
      if (!res.ok) {
        Alert.alert('Operazione non riuscita', json.error || 'Riprova.');
        return;
      }
      Alert.alert('Ingresso negato', json.refunded ? 'Prenotazione annullata e rimborso avviato.' : 'Prenotazione annullata.');
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

  if (hasVenue === false) {
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
    const b = result.booking;
    const wrongNight = result.status === 'wrong_night';
    const justNow = !!result.justEnteredNow;     // check-in appena registrato ora
    const reEntry = b.checkedIn && !justNow;       // già scannerizzato prima → rientro
    const age = b.age;
    const checkedInTime = b.checkedInAt
      ? new Date(b.checkedInAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
      : null;

    // Colore cornice: rosso per altra-serata, ambra per rientro, verde per ingresso ok.
    const borderColor = wrongNight ? 'rgba(239,68,68,0.45)' : reEntry ? 'rgba(245,158,11,0.4)' : 'rgba(74,222,128,0.35)';

    return (
      <View style={{ flex: 1, backgroundColor: '#09090f', justifyContent: 'center', paddingHorizontal: 24 }}>
        <View style={{ backgroundColor: '#111118', borderRadius: 20, padding: 24, borderWidth: 1, borderColor }}>

          {/* Banner esito */}
          {wrongNight ? (
            <View style={{ backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, marginBottom: 20, alignItems: 'center' }}>
              <Text style={{ color: '#F87171', fontWeight: '900', fontSize: 16 }}>⚠️ ALTRA SERATA</Text>
              <Text style={{ color: '#FCA5A5', fontSize: 12, marginTop: 4, fontWeight: '600', textAlign: 'center' }}>
                Questo QR è per un&apos;altra serata — non valido stasera
              </Text>
            </View>
          ) : reEntry ? (
            <View style={{ backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, marginBottom: 20, alignItems: 'center' }}>
              <Text style={{ color: '#FBBF24', fontWeight: '900', fontSize: 16 }}>⚠️ GIÀ SCANNERIZZATO</Text>
              <Text style={{ color: '#F59E0B', fontSize: 12, marginTop: 4, fontWeight: '600' }}>Rientro — verifica nome e foto</Text>
              {checkedInTime && (
                <Text style={{ color: '#92400E', fontSize: 11, marginTop: 3 }}>Prima entrata: {checkedInTime}</Text>
              )}
            </View>
          ) : (
            <View style={{ marginBottom: 20, backgroundColor: 'rgba(74,222,128,0.1)', borderRadius: 10, paddingVertical: 12, borderWidth: 1, borderColor: 'rgba(74,222,128,0.25)', alignItems: 'center' }}>
              <Text style={{ color: '#4ADE80', fontWeight: '900', fontSize: 16 }}>✅ INGRESSO REGISTRATO</Text>
              {checkedInTime && <Text style={{ color: '#4ADE80', fontSize: 12, marginTop: 3, fontWeight: '600' }}>Entrato alle {checkedInTime}</Text>}
            </View>
          )}

          {/* Foto profilo */}
          <View style={{ alignItems: 'center', marginBottom: 12 }}>
            {b.avatarUrl ? (
              <Image
                source={{ uri: b.avatarUrl }}
                style={{ width: 88, height: 88, borderRadius: 44, borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)' }}
              />
            ) : (
              <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: '#23232c', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)' }}>
                <Text style={{ color: '#8B8B96', fontSize: 30, fontWeight: '800' }}>{initials(b.name) || '?'}</Text>
              </View>
            )}
          </View>

          <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900', textAlign: 'center', marginBottom: 10, letterSpacing: 0.3 }}>
            {b.name}
          </Text>

          {age != null && (
            <View style={{ alignSelf: 'center', backgroundColor: 'rgba(168,85,247,0.15)', borderWidth: 1, borderColor: 'rgba(168,85,247,0.4)', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 6, marginBottom: 20 }}>
              <Text style={{ color: '#A855F7', fontWeight: '900', fontSize: 20 }}>{age} anni</Text>
            </View>
          )}

          <View style={{ backgroundColor: '#18181f', borderRadius: 12, padding: 14, marginBottom: 16 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14, marginBottom: 4 }} numberOfLines={2}>{b.event.title}</Text>
            <Text style={{ color: wrongNight ? '#F87171' : '#A855F7', fontSize: 13 }}>{formatDateFull(b.event.date)} · {formatTime(b.event.time)}</Text>
            {b.table ? (
              <View style={{ marginTop: 10, backgroundColor: 'rgba(168,85,247,0.1)', borderRadius: 8, padding: 10 }}>
                <Text style={{ color: '#A855F7', fontWeight: '800', fontSize: 13 }}>TAVOLO {b.table.typeName}</Text>
                <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 3 }}>
                  {b.table.peopleCount}/{b.table.maxPeople} persone · raccolti {Number(b.table.collected).toFixed(0)}/{Number(b.table.tableTotal).toFixed(0)} €
                </Text>
                <Text style={{ color: '#64748B', fontSize: 12, marginTop: 2 }}>
                  Quota di questo ospite: {Number(b.totalPrice).toFixed(2).replace('.', ',')} €
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                <Text style={{ color: '#64748B', fontSize: 12 }}>{b.quantity} {b.quantity > 1 ? 'posti' : 'posto'}</Text>
                <Text style={{ color: '#9CA3AF', fontSize: 12 }}>{Number(b.totalPrice).toFixed(2).replace('.', ',')} €</Text>
              </View>
            )}
          </View>

          {/* Check-in già automatico allo scan: resta solo il rifiuto come override. */}
          {wrongNight ? (
            <View style={{ backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ color: '#F87171', fontWeight: '800', fontSize: 14, textAlign: 'center' }}>Biglietto di un&apos;altra serata</Text>
              <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 4, textAlign: 'center' }}>Non far entrare con questo QR stasera</Text>
            </View>
          ) : (
            <Pressable onPress={handleDenyEntry} disabled={denying}
              style={({ pressed }) => ({ paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)', backgroundColor: 'rgba(239,68,68,0.08)', opacity: denying || pressed ? 0.7 : 1 })}
            >
              {denying ? <ActivityIndicator color="#F87171" /> : <Text style={{ color: '#F87171', fontWeight: '800', fontSize: 14 }}>✕ Rifiuta ingresso e rimborsa</Text>}
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
