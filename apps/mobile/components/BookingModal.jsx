import { useState, useRef, useEffect } from 'react';
import { Modal, View, Text, Pressable, ActivityIndicator } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as ScreenCapture from 'expo-screen-capture';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { COLORS, FONT_FAMILY, formatTime, generateBookingQR, computeBookingPrice } from '@lets-night/shared';
import { useI18n } from '../lib/i18n';
import { sendLocalNotification } from '../lib/notifications';
import { API_URL } from '../lib/apiUrl';

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

// Prezzi in formato italiano: "16,50 €"
function euro(v) {
  return v.toFixed(2).replace('.', ',') + ' €';
}

export default function BookingModal({ visible, onClose, event, session }) {
  const { t, fmtDateFull, fmtPrice } = useI18n();
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
        title: t('booking.notifTitle'),
        body: `${event.title} — ${fmtDateFull(event.event_date)}`,
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
      setError(t('booking.sessionExpired'));
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
        if (err.code === '23505') setError(t('booking.already'));
        else if (err.code === '23514' || /CAPACITY_FULL/.test(err.message || '')) setError(t('booking.soldOut'));
        else { setError(t('booking.genericFail')); console.error('Errore booking:', err); }
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
          returnBase: API_URL,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) {
        if (json?.duplicate) {
          setLoading(false);
          submitting.current = false;
          setError(t('booking.alreadyTab'));
          return;
        }
        throw new Error(json.error || t('booking.payCreateError'));
      }

      // sessionId noto PRIMA del browser: in Expo Go il deep link letsnight:// non torna
      // nell'app (l'utente chiude il browser a mano → 'dismiss'), quindi confermiamo con
      // la session che già conosciamo. Nelle dev/prod build arriva anche via result.url.
      const checkoutSessionId = json.sessionId;
      const result = await WebBrowser.openAuthSessionAsync(json.url, APP_RETURN_SCHEME);

      let sessionId = null;
      if (result.type === 'success' && result.url) {
        const parsed = parseReturnUrl(result.url);
        if (parsed.status === 'success') sessionId = parsed.sessionId;
      } else if (result.type === 'dismiss' || result.type === 'cancel') {
        // Può aver pagato e poi chiuso il browser: ritentiamo con la session nota.
        sessionId = checkoutSessionId;
      }

      if (!sessionId) {
        setLoading(false);
        submitting.current = false;
        return; // annullato dall'utente
      }

      const confirmRes = await fetch(`${API_URL}/api/stripe/confirm-booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, accessToken: session.access_token }),
      });
      const confirmJson = await confirmRes.json();
      setLoading(false);
      submitting.current = false;

      if (confirmRes.ok && confirmJson.qrCode) {
        onBookingSuccess(confirmJson.qrCode);
        return;
      }
      // 402 = pagamento non completato → vero annullamento: chiudi in silenzio.
      if (confirmRes.status === 402) return;
      if (confirmJson.refunded) {
        let msg;
        if (confirmJson.duplicate) msg = t('booking.dupRefund');
        else if (confirmJson.oversold) msg = t('booking.oversoldRefund');
        else msg = t('booking.priceChangedRefund');
        setError(msg);
      } else {
        setError(confirmJson.error || t('booking.confirmFailed'));
      }
    } catch (e) {
      console.error('Errore checkout:', e);
      setLoading(false);
      submitting.current = false;
      setError(t('booking.connError'));
    }
  }

  if (!event || !pricing) return null;

  const safePrice = Math.max(0, Number(event.price) || 0);
  const safeTablePrice = Math.max(0, Number(event.table_price) || 0);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }}
          onPress={handleClose}
        />
        <View style={{ backgroundColor: COLORS.bgElev2, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 }}>
          <View style={{ width: 36, height: 4, backgroundColor: COLORS.borderStrong, borderRadius: 2, alignSelf: 'center', marginBottom: 22 }} />

          {success ? (
            <View style={{ alignItems: 'center', paddingVertical: 4 }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(74,222,128,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <Ionicons name="checkmark" size={28} color={COLORS.success} />
              </View>
              <Text style={{ fontFamily: FONT_FAMILY.displayHeavy, color: COLORS.textPrimary, fontSize: 22, letterSpacing: -0.4, marginBottom: 6 }}>
                {t('booking.booked')}
              </Text>
              <Text style={{ color: COLORS.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 20 }}>
                {t('booking.showQr')}{'\n'}{t('booking.findInTickets')}
              </Text>
              {lastQR && (
                <View style={{ backgroundColor: '#fff', padding: 16, borderRadius: 16, marginBottom: 22 }}>
                  <QRCode value={lastQR} size={180} />
                </View>
              )}
              <Pressable
                onPress={handleClose}
                style={({ pressed }) => ({ backgroundColor: COLORS.brandStrong, paddingVertical: 15, borderRadius: 12, width: '100%', alignItems: 'center', opacity: pressed ? 0.85 : 1 })}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{t('common.close')}</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* Header */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text numberOfLines={2} style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 19, lineHeight: 24, letterSpacing: -0.3 }}>
                    {event.title}
                  </Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 4 }}>
                    {event.venues?.name ? `${event.venues.name} · ` : ''}{fmtDateFull(event.event_date)} · {formatTime(event.event_time) || '—'}
                  </Text>
                </View>
                <Pressable onPress={handleClose} hitSlop={10}>
                  <Ionicons name="close" size={22} color={COLORS.textMuted} />
                </Pressable>
              </View>

              <View style={{ height: 1, backgroundColor: COLORS.borderSubtle, marginVertical: 16 }} />

              {/* Tipo prenotazione */}
              {hasTables && (
                <View style={{ marginBottom: 18 }}>
                  <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>
                    Tipo prenotazione
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {[
                      { id: 'ticket', label: t('booking.entry'), sub: fmtPrice(safePrice) },
                      { id: 'table',  label: t('booking.table'),   sub: safeTablePrice > 0 ? `${safeTablePrice} €` : t('booking.onRequest') },
                    ].map(opt => {
                      const active = bookingType === opt.id;
                      return (
                        <Pressable
                          key={opt.id}
                          onPress={() => { setError(''); setBookingType(opt.id); }}
                          style={{
                            flex: 1, padding: 14, borderRadius: 12,
                            backgroundColor: active ? '#FAFAFA' : COLORS.bgElev3,
                          }}
                        >
                          <Text style={{ color: active ? COLORS.bg : COLORS.textSecondary, fontSize: 14, fontWeight: '700', marginBottom: 2 }}>
                            {opt.label}
                          </Text>
                          <Text style={{ color: active ? '#52525B' : COLORS.textMuted, fontSize: 12 }}>
                            {opt.sub}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Quantità */}
              {pricing.bookingType !== 'table' && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                  <Text style={{ color: COLORS.textPrimary, fontSize: 15, fontWeight: '600' }}>{t('booking.seats')}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
                    <Pressable
                      onPress={() => setQuantity(q => Math.max(1, q - 1))}
                      hitSlop={6}
                      style={({ pressed }) => ({
                        width: 36, height: 36, borderRadius: 18,
                        borderWidth: 1, borderColor: COLORS.borderStrong,
                        alignItems: 'center', justifyContent: 'center',
                        opacity: pressed ? 0.6 : 1,
                      })}
                    >
                      <Ionicons name="remove" size={16} color={COLORS.textPrimary} />
                    </Pressable>
                    <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 18, minWidth: 26, textAlign: 'center' }}>
                      {quantity}
                    </Text>
                    <Pressable
                      onPress={() => setQuantity(q => Math.min(10, q + 1))}
                      hitSlop={6}
                      style={({ pressed }) => ({
                        width: 36, height: 36, borderRadius: 18,
                        borderWidth: 1, borderColor: COLORS.borderStrong,
                        alignItems: 'center', justifyContent: 'center',
                        opacity: pressed ? 0.6 : 1,
                      })}
                    >
                      <Ionicons name="add" size={16} color={COLORS.textPrimary} />
                    </Pressable>
                  </View>
                </View>
              )}

              {/* Riepilogo costi */}
              <View style={{ paddingTop: 14, borderTopWidth: 1, borderTopColor: COLORS.borderSubtle, marginBottom: 16 }}>
                {!pricing.isFree && (
                  <>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>{t('booking.subtotal')}</Text>
                      <Text style={{ color: COLORS.textSecondary, fontSize: 13 }}>{euro(pricing.lineTotal)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                      <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>{t('booking.fee')}</Text>
                      <Text style={{ color: COLORS.textSecondary, fontSize: 13 }}>{euro(pricing.fee)}</Text>
                    </View>
                  </>
                )}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase' }}>{t('booking.total')}</Text>
                  <Text style={{ fontFamily: FONT_FAMILY.displayHeavy, color: COLORS.textPrimary, fontSize: 24, letterSpacing: -0.4 }}>
                    {pricing.isFree ? t('booking.freeLabel') : euro(pricing.total)}
                  </Text>
                </View>
              </View>

              {!pricing.isFree && (
                <Text style={{ color: COLORS.textDisabled, fontSize: 11, textAlign: 'center', marginBottom: 14, lineHeight: 15 }}>
                  {t('booking.policy')}
                </Text>
              )}

              {error ? (
                <View style={{ backgroundColor: 'rgba(248,113,113,0.08)', borderRadius: 10, padding: 12, marginBottom: 14 }}>
                  <Text style={{ color: '#FCA5A5', fontSize: 13, textAlign: 'center', lineHeight: 18 }}>{error}</Text>
                </View>
              ) : null}

              <Pressable
                onPress={handleConfirm}
                disabled={loading}
                style={({ pressed }) => ({
                  backgroundColor: COLORS.brandStrong,
                  paddingVertical: 16,
                  borderRadius: 14,
                  alignItems: 'center',
                  opacity: loading || pressed ? 0.75 : 1,
                })}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
                      {pricing.isFree ? t('booking.confirmFree') : t('booking.pay', { amount: euro(pricing.total) })}
                    </Text>
                }
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
