import { useState, useCallback, useRef } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert, Linking, Image } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { API_URL } from '../../lib/apiUrl';
import { useI18n } from '../../lib/i18n';
import { Ionicons } from '@expo/vector-icons';
import { formatTime, COLORS, FONT_FAMILY } from '@lets-night/shared';

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
  wrong_venue: ['scanner.wrongVenueT', 'scanner.wrongVenueB'],
  not_found: ['scanner.notFoundT', 'scanner.notFoundB'],
  cancelled: ['scanner.cancelledT', 'scanner.cancelledB'],
  refunded: ['scanner.refundedT', 'scanner.refundedB'],
  refunded_after_entry: ['scanner.refundedT', 'scanner.refundedAfterB'],
  no_venue: ['scanner.noVenueT', 'scanner.noVenueB'],
};

export default function ScannerScreen() {
  const { t, fmtDateFull } = useI18n();
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
      Alert.alert(t('scanner.loadingT'), t('scanner.loadingB'));
      return;
    }
    if (hasVenue === false) {
      Alert.alert(t('scanner.noVenueT'), t('scanner.noVenueB'));
      return;
    }
    scanningRef.current = true;
    setScanning(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { Alert.alert(t('ticketDetail.sessionExpired'), t('ticketDetail.reloginBody')); return; }

      const res = await fetch(`${API_URL}/api/scan/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrCode, accessToken: session.access_token }),
      });
      const json = await res.json();

      if (!res.ok) {
        Alert.alert(t('scanner.verifyFailT'), json.error || t('common.retry'));
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
      const [titleKey, msgKey] = ALERTS[json.status] || ['scanner.notFoundT', 'scanner.unknownB'];
      const [title, msg] = [t(titleKey), t(msgKey)];
      Alert.alert(title, msg);
    } catch {
      Alert.alert(t('tickets.connErrorTitle'), t('scanner.connErrB'));
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
      t('scanner.denyConfirmT'),
      t('scanner.denyConfirmB'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('scanner.denyBtn'), style: 'destructive', onPress: doDenyEntry },
      ]
    );
  }

  async function doDenyEntry() {
    setDenying(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setDenying(false);
      Alert.alert(t('ticketDetail.sessionExpired'), t('ticketDetail.reloginBody'));
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
        Alert.alert(t('scanner.opFailT'), json.error || t('common.retry'));
        return;
      }
      Alert.alert(t('scanner.deniedT'), json.refunded ? t('scanner.deniedRefunded') : t('scanner.deniedOnly'));
      setResult(null);
    } catch {
      setDenying(false);
      Alert.alert(t('tickets.connErrorTitle'), t('ticketDetail.connErrorBody'));
    }
  }

  if (!permission) return <View style={{ flex: 1, backgroundColor: COLORS.bg }} />;

  if (!permission.granted) {
    const canAsk = permission.canAskAgain;
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
        <Ionicons name="camera-outline" size={48} color={COLORS.textMuted} style={{ marginBottom: 16 }} />
        <Text style={{ fontFamily: FONT_FAMILY.displayHeavy, color: '#fff', fontSize: 20, textAlign: 'center', marginBottom: 8 }}>{t('scanner.cameraNeeded')}</Text>
        <Text style={{ color: COLORS.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 28 }}>
          {canAsk
            ? t('scanner.cameraAsk')
            : t('scanner.cameraDenied')}
        </Text>
        <Pressable
          onPress={() => canAsk ? requestPermission() : Linking.openSettings()}
          style={{ backgroundColor: COLORS.brandStrong, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12, width: '100%' }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15, textAlign: 'center' }}>
            {canAsk ? t('scanner.grantAccess') : t('scanner.openSettings')}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (hasVenue === false) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
        <Ionicons name="business-outline" size={44} color={COLORS.textMuted} style={{ marginBottom: 14 }} />
        <Text style={{ fontFamily: FONT_FAMILY.displayHeavy, color: '#fff', fontSize: 19, textAlign: 'center', marginBottom: 8 }}>{t('scanner.noVenueTitle')}</Text>
        <Text style={{ color: COLORS.textMuted, textAlign: 'center', lineHeight: 21 }}>
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
      <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', paddingHorizontal: 24 }}>
        <View style={{ backgroundColor: COLORS.bgElev2, borderRadius: 20, padding: 24, borderWidth: 1, borderColor }}>

          {/* Banner esito */}
          {wrongNight ? (
            <View style={{ backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, marginBottom: 20, alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="warning" size={16} color="#F87171" />
                <Text style={{ color: '#F87171', fontWeight: '900', fontSize: 16 }}>{t('scanner.wrongNight')}</Text>
              </View>
              <Text style={{ color: '#FCA5A5', fontSize: 12, marginTop: 4, fontWeight: '600', textAlign: 'center' }}>
                {t('scanner.wrongNightSub')}
              </Text>
            </View>
          ) : reEntry ? (
            <View style={{ backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, marginBottom: 20, alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="warning" size={16} color="#FBBF24" />
                <Text style={{ color: '#FBBF24', fontWeight: '900', fontSize: 16 }}>{t('scanner.alreadyScanned')}</Text>
              </View>
              <Text style={{ color: '#F59E0B', fontSize: 12, marginTop: 4, fontWeight: '600' }}>{t('scanner.reentryCheck')}</Text>
              {checkedInTime && (
                <Text style={{ color: '#92400E', fontSize: 11, marginTop: 3 }}>Prima entrata: {checkedInTime}</Text>
              )}
            </View>
          ) : (
            <View style={{ marginBottom: 20, backgroundColor: 'rgba(74,222,128,0.1)', borderRadius: 10, paddingVertical: 12, borderWidth: 1, borderColor: 'rgba(74,222,128,0.25)', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="checkmark-circle" size={16} color="#4ADE80" />
                <Text style={{ color: '#4ADE80', fontWeight: '900', fontSize: 16 }}>{t('scanner.entryRegistered')}</Text>
              </View>
              {checkedInTime && <Text style={{ color: '#4ADE80', fontSize: 12, marginTop: 3, fontWeight: '600' }}>{t('scanner.enteredAt', { time: checkedInTime })}</Text>}
            </View>
          )}

          {/* Foto profilo */}
          <View style={{ alignItems: 'center', marginBottom: 12 }}>
            {b.avatarUrl ? (
              <Image
                source={{ uri: b.avatarUrl }}
                style={{ width: 88, height: 88, borderRadius: 44, borderWidth: 2, borderColor: COLORS.borderStrong }}
              />
            ) : (
              <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: COLORS.bgElev3, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.borderSubtle }}>
                <Text style={{ color: COLORS.textMuted, fontSize: 30, fontWeight: '800' }}>{initials(b.name) || '?'}</Text>
              </View>
            )}
          </View>

          <Text style={{ fontFamily: FONT_FAMILY.displayHeavy, color: '#fff', fontSize: 26, textAlign: 'center', marginBottom: 10, letterSpacing: 0.3 }}>
            {b.name}
          </Text>

          {age != null && (
            <View style={{ alignSelf: 'center', backgroundColor: COLORS.bgElev3, borderWidth: 1, borderColor: COLORS.borderSubtle, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 6, marginBottom: 20 }}>
              <Text style={{ color: COLORS.brand, fontWeight: '900', fontSize: 20 }}>{t('scanner.yearsOld', { age })}</Text>
            </View>
          )}

          <View style={{ backgroundColor: COLORS.bgElev3, borderRadius: 12, padding: 14, marginBottom: 16 }}>
            <Text style={{ fontFamily: FONT_FAMILY.display, color: '#fff', fontSize: 14, marginBottom: 4 }} numberOfLines={2}>{b.event.title}</Text>
            <Text style={{ color: wrongNight ? '#F87171' : COLORS.brand, fontSize: 13 }}>{fmtDateFull(b.event.date)} · {formatTime(b.event.time)}</Text>
            {b.table ? (
              <View style={{ marginTop: 10, backgroundColor: COLORS.brandSubtle, borderRadius: 8, padding: 10 }}>
                <Text style={{ color: COLORS.brand, fontWeight: '800', fontSize: 13 }}>TAVOLO {b.table.typeName}</Text>
                <Text style={{ color: COLORS.textSecondary, fontSize: 12, marginTop: 3 }}>
                  {b.table.peopleCount}/{b.table.maxPeople} persone · raccolti {Number(b.table.collected).toFixed(0)}/{Number(b.table.tableTotal).toFixed(0)} €
                </Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                  Quota di questo ospite: {Number(b.totalPrice).toFixed(2).replace('.', ',')} €
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>{b.quantity} {b.quantity > 1 ? 'posti' : 'posto'}</Text>
                <Text style={{ color: COLORS.textSecondary, fontSize: 12 }}>{Number(b.totalPrice).toFixed(2).replace('.', ',')} €</Text>
              </View>
            )}
          </View>

          {/* Check-in già automatico allo scan: resta solo il rifiuto come override. */}
          {wrongNight ? (
            <View style={{ backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ color: '#F87171', fontWeight: '800', fontSize: 14, textAlign: 'center' }}>{t('scanner.wrongNightSub')}</Text>
              <Text style={{ color: COLORS.textSecondary, fontSize: 12, marginTop: 4, textAlign: 'center' }}>{t('scanner.dontLetIn')}</Text>
            </View>
          ) : (
            <Pressable onPress={handleDenyEntry} disabled={denying}
              style={({ pressed }) => ({ paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)', backgroundColor: 'rgba(239,68,68,0.08)', opacity: denying || pressed ? 0.7 : 1 })}
            >
              {denying ? <ActivityIndicator color="#F87171" /> : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="close-circle" size={15} color="#F87171" />
                  <Text style={{ color: '#F87171', fontWeight: '800', fontSize: 14 }}>{t('scanner.denyEntryRefund')}</Text>
                </View>
              )}
            </Pressable>
          )}

          <Pressable onPress={() => setResult(null)} style={({ pressed }) => ({ paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: COLORS.brandBorder, opacity: pressed ? 0.7 : 1 })}>
            <Text style={{ color: COLORS.brand, fontWeight: '700', fontSize: 14 }}>{t('scanner.scanAnother')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 }}>
        <Text style={{ color: COLORS.brand, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>{t('scanner.eyebrow')}</Text>
        <Text style={{ fontFamily: FONT_FAMILY.displayHeavy, color: '#fff', fontSize: 24 }}>{t('scanner.title')}</Text>
        <Text style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 4 }}>{t('scanner.subtitle')}</Text>
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
          <View style={{ width: 220, height: 220, borderWidth: 2, borderColor: COLORS.brand, borderRadius: 16, backgroundColor: 'transparent' }} />
        </View>
        {scanning && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={COLORS.brand} size="large" />
            <Text style={{ color: '#fff', marginTop: 12, fontSize: 14 }}>Verifica biglietto...</Text>
          </View>
        )}
      </View>

      <View style={{ paddingHorizontal: 20, paddingBottom: 40, alignItems: 'center' }}>
        <Text style={{ color: COLORS.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 20 }}>
          Inquadra il QR code mostrato nell&apos;app del cliente.{'\n'}Il check-in viene registrato automaticamente.
        </Text>
      </View>
    </View>
  );
}
