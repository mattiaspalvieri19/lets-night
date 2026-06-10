import { useState, useRef, useEffect } from 'react';
import { Modal, View, Text, Pressable, ActivityIndicator } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as ScreenCapture from 'expo-screen-capture';
import QRCode from 'react-native-qrcode-svg';
import { supabase } from '../lib/supabase';
import { formatDateFull, formatTime, getPriceLabel, generateBookingQR, computeBookingPrice } from '@lets-night/shared';
import { sendLocalNotification } from '../lib/notifications';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
const APP_RETURN_SCHEME = 'letsnight://payment-return';

function parseReturnUrl(url) {
  if (!url || typeof url !== 'string') return { status: null, sessionId: null };
  const statusMatch = url.match(/[?&]status=([^&]+)/);
  const sessionMatch = url.match(/[?&]session_id=([^&]+)/);
  return {
    status: statusMatch ? decodeURIComponent(statusMatch[1]) : null,
    sessionId: sessionMatch ? decodeURIComponent(sessionMatch[1]) : null,
  };
}

export default function BookingModal({ visible, onClose, event, session }) {
  const [quantity, setQuantity] = useState(1);
  const [bookingType, setBookingType] = useState('ticket');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [lastQR, setLastQR] = useState(null);
  const submitting = useRef(false);

  const pricing = event ? computeBookingPrice(event, bookingType, quantity) : null;
  const hasTables = !!event?.has_tables;

  // Anti-screenshot quando il QR è visibile.
  useEffect(() => {
    if (!success || !lastQR) return;
    ScreenCapture.preventScreenCaptureAsync().catch(() => {});
    return () => { ScreenCapture.allowScreenCaptureAsync().catch(() => {}); };
  }, [success, lastQR]);

  // Reset completo quando la modal si chiude da fuori (parent flippa visible).
  useEffect(() => {
    if (!visible) {
      setQuantity(1);
      setBookingType('ticket');
      setSuccess(false);
      setError('');
      setLastQR(null);
      setLoading(false);
      submitting.current = false;
    }
  }, [visible]);

  function handleClose() {
    setQuantity(1);
    setBookingType('ticket');
    setSuccess(false);
    setError('');
    setLastQR(null);
    setLoading(false);
    submitting.current = false;
    onClose();
  }

  function onBookingSuccess(qrCode) {
    setLastQR(qrCode);
    setSuccess(true);
    try {
      sendLocalNotification({
        title: 'Prenotazione confermata!',
        body: `${event.title} — ${formatDateFull(event.event_date)}`,
        data: { type: 'booking', event_id: event.id },
      });
    } catch {}
    supabase.functions.invoke('notify-new-booking', {
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: { event_id: event.id, user_id: session.user.id },
    }).catch(() => {});
  }

  async function handleConfirm() {
    if (submitting.current || !pricing) return;
    if (!session) {
      setError('Sessione scaduta. Rieffettua il login.');
      return;
    }

    submitting.current = true;
    setLoading(true);
    setError('');

    if (pricing.isFree) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', session.user.id)
        .maybeSingle();
      const qrCode = generateBookingQR();
      const { error: err } = await supabase.from('bookings').insert({
        user_id: session.user.id,
        event_id: event.id,
        status: 'confirmed',
        quantity: pricing.safeQty,
        total_price: 0,
        fee: 0,
        qr_code: qrCode,
        booking_type: pricing.bookingType,
        snapshot_full_name: prof?.full_name || null,
      });
      setLoading(false);
      submitting.current = false;
      if (err) {
        if (err.code === '23505') setError('Hai già prenotato questo evento.');
        else { setError('Prenotazione non riuscita. Riprova.'); console.error('Errore booking:', err); }
        return;
      }
      onBookingSuccess(qrCode);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/stripe/checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          quantity: pricing.safeQty,
          bookingType: pricing.bookingType,
          accessToken: session.access_token,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) {
        if (json?.duplicate) {
          setLoading(false);
          submitting.current = false;
          setError('Hai già prenotato questo evento. Lo trovi nella tab Biglietti.');
          return;
        }
        throw new Error(json.error || 'Errore creazione pagamento');
      }

      const result = await WebBrowser.openAuthSessionAsync(json.url, APP_RETURN_SCHEME);

      if (result.type !== 'success' || !result.url) {
        setLoading(false);
        submitting.current = false;
        if (result.type === 'cancel' || result.type === 'dismiss') return;
        setError('Pagamento annullato o non completato.');
        return;
      }

      const { status, sessionId } = parseReturnUrl(result.url);

      if (status !== 'success' || !sessionId) {
        setLoading(false);
        submitting.current = false;
        setError('Pagamento non completato.');
        return;
      }

      const confirmRes = await fetch(`${API_URL}/api/stripe/confirm-booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, accessToken: session.access_token }),
      });
      const confirmJson = await confirmRes.json();
      setLoading(false);
      submitting.current = false;

      if (!confirmRes.ok || !confirmJson.qrCode) {
        if (confirmJson.refunded) {
          let msg;
          if (confirmJson.duplicate) msg = 'Avevi già una prenotazione per questo evento. Rimborso automatico avviato: lo vedrai sulla carta entro 5-10 giorni lavorativi.';
          else if (confirmJson.oversold) msg = 'Posti esauriti dopo il pagamento. Il rimborso è stato avviato automaticamente: lo vedrai sulla tua carta entro 5-10 giorni lavorativi.';
          else msg = 'Il prezzo dell\'evento è cambiato dopo il pagamento. Rimborso automatico avviato: lo vedrai sulla carta entro 5-10 giorni lavorativi.';
          setError(msg);
        } else {
          setError(confirmJson.error || 'Pagamento riuscito ma prenotazione non confermata. Contatta supporto.');
        }
        return;
      }

      onBookingSuccess(confirmJson.qrCode);
    } catch (e) {
      console.error('Errore checkout:', e);
      setLoading(false);
      submitting.current = false;
      setError('Errore di connessione. Riprova.');
    }
  }

  if (!event || !pricing) return null;

  const safePrice = Math.max(0, Number(event.price) || 0);
  const safeTablePrice = Math.max(0, Number(event.table_price) || 0);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' }}
          onPress={handleClose}
        />
        <View style={{ backgroundColor: '#111118', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, borderTopWidth: 1, borderColor: 'rgba(168,85,247,0.2)' }}>
          <View style={{ width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />

          {success ? (
            <View style={{ alignItems: 'center', paddingVertical: 8 }}>
              <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(34,197,94,0.15)', borderWidth: 1.5, borderColor: 'rgba(74,222,128,0.4)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: 24 }}>✓</Text>
              </View>
              <Text style={{ color: '#fff', fontSize: 19, fontWeight: '900', marginBottom: 4 }}>Prenotato!</Text>
              <Text style={{ color: '#64748B', fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 18 }}>
                Mostra questo QR all&apos;ingresso. Lo ritrovi sempre in &quot;Biglietti&quot;.
              </Text>
              {lastQR && (
                <View style={{ backgroundColor: '#fff', padding: 14, borderRadius: 14, marginBottom: 18 }}>
                  <QRCode value={lastQR} size={180} />
                </View>
              )}
              <Pressable
                onPress={handleClose}
                style={{ backgroundColor: '#7C3AED', paddingHorizontal: 40, paddingVertical: 14, borderRadius: 12, width: '100%' }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15, textAlign: 'center' }}>Chiudi</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ color: '#A855F7', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>Prenota</Text>
                  <Text numberOfLines={2} style={{ color: '#fff', fontSize: 18, fontWeight: '800', lineHeight: 23 }}>{event.title}</Text>
                  <Text style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>{event.venues?.name}</Text>
                </View>
                <Pressable onPress={handleClose} hitSlop={8}>
                  <Text style={{ color: '#64748B', fontSize: 22 }}>×</Text>
                </Pressable>
              </View>

              <View style={{ backgroundColor: '#18181f', borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(168,85,247,0.12)' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View>
                    <Text style={{ color: '#64748B', fontSize: 11, marginBottom: 3 }}>Data</Text>
                    <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>{formatDateFull(event.event_date)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: '#64748B', fontSize: 11, marginBottom: 3 }}>Orario</Text>
                    <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>{formatTime(event.event_time) || '—'}</Text>
                  </View>
                </View>
              </View>

              {hasTables && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ color: '#64748B', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>
                    Tipo prenotazione
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {[
                      { id: 'ticket', label: '🎟️ Ingresso', sub: getPriceLabel(safePrice) },
                      { id: 'table',  label: '🍾 Tavolo',   sub: safeTablePrice > 0 ? `EUR ${safeTablePrice}` : 'Su richiesta' },
                    ].map(opt => {
                      const active = bookingType === opt.id;
                      return (
                        <Pressable key={opt.id} onPress={() => { setError(''); setBookingType(opt.id); }}
                          style={{
                            flex: 1, padding: 14, borderRadius: 12,
                            backgroundColor: active ? 'rgba(124,58,237,0.15)' : '#18181f',
                            borderWidth: 1.5,
                            borderColor: active ? '#7C3AED' : 'rgba(168,85,247,0.2)',
                          }}>
                          <Text style={{ color: active ? '#fff' : '#9CA3AF', fontSize: 13, fontWeight: '700', marginBottom: 3 }}>
                            {opt.label}
                          </Text>
                          <Text style={{ color: active ? '#A855F7' : '#64748B', fontSize: 11 }}>
                            {opt.sub}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {pricing.bookingType !== 'table' && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Posti</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                    <Pressable
                      onPress={() => setQuantity(q => Math.max(1, q - 1))}
                      style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: 'rgba(168,85,247,0.3)', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ color: '#A855F7', fontSize: 20, fontWeight: '700', lineHeight: 24 }}>−</Text>
                    </Pressable>
                    <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', minWidth: 24, textAlign: 'center' }}>{quantity}</Text>
                    <Pressable
                      onPress={() => setQuantity(q => Math.min(10, q + 1))}
                      style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: 'rgba(168,85,247,0.3)', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ color: '#A855F7', fontSize: 20, fontWeight: '700', lineHeight: 24 }}>+</Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {/* Riepilogo costi */}
              <View style={{ paddingVertical: 14, borderTopWidth: 1, borderTopColor: 'rgba(168,85,247,0.12)', marginBottom: 20 }}>
                {!pricing.isFree && (
                  <>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ color: '#64748B', fontSize: 13 }}>Subtotale</Text>
                      <Text style={{ color: '#fff', fontSize: 13 }}>EUR {pricing.lineTotal.toFixed(2)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text style={{ color: '#64748B', fontSize: 13 }}>Commissione</Text>
                      <Text style={{ color: '#fff', fontSize: 13 }}>EUR {pricing.fee.toFixed(2)}</Text>
                    </View>
                  </>
                )}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: '#64748B', fontSize: 14 }}>Totale</Text>
                  <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900' }}>
                    {pricing.isFree ? 'Gratuito' : `EUR ${pricing.total.toFixed(2)}`}
                  </Text>
                </View>
              </View>

              {error ? (
                <View style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                  <Text style={{ color: '#fca5a5', fontSize: 13, textAlign: 'center' }}>{error}</Text>
                </View>
              ) : null}

              <Pressable
                onPress={handleConfirm}
                disabled={loading}
                style={({ pressed }) => ({
                  backgroundColor: '#7C3AED',
                  paddingVertical: 16,
                  borderRadius: 12,
                  alignItems: 'center',
                  opacity: loading || pressed ? 0.7 : 1,
                })}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                      {pricing.isFree ? 'Conferma prenotazione' : `Paga EUR ${pricing.total.toFixed(2)}`}
                    </Text>
                }
              </Pressable>
            </>
          )}
          <View style={{ height: 8 }} />
        </View>
      </View>
    </Modal>
  );
}
