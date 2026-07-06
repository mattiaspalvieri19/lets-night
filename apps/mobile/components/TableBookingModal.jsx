import { useState, useRef, useEffect } from 'react';
import { Modal, View, Text, Pressable, TextInput, ActivityIndicator } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as ScreenCapture from 'expo-screen-capture';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { COLORS, FONT_FAMILY, BOOKING_FEE, TABLE_MIN_SHARE } from '@lets-night/shared';
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

function euro(v) {
  return v.toFixed(2).replace('.', ',') + ' €';
}

function parseShare(text) {
  const n = parseFloat(String(text).replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

// mode: { action: 'open', type } | { action: 'join', table }
export default function TableBookingModal({ visible, onClose, event, session, mode, onSuccess }) {
  const { t, fmtDateFull } = useI18n();
  const [share, setShare] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [lastQR, setLastQR] = useState(null);
  const submitting = useRef(false);

  const isOpen = mode?.action === 'open';
  const type = mode?.type;
  const table = mode?.table;

  const total = isOpen ? Number(type?.total_price || 0) : Number(table?.total_price || 0);
  const maxPeople = isOpen ? (type?.max_people || 8) : (table?.max_people || 8);
  const remaining = isOpen ? total : Math.max(0, total - Number(table?.collected || 0));
  const seatsLeft = isOpen ? maxPeople : Math.max(1, maxPeople - (table?.people_count || 0));
  const maxShare = remaining;
  const fairShare = Math.max(TABLE_MIN_SHARE, Math.round((remaining / seatsLeft) * 100) / 100);

  // Prefill quota a ogni apertura: privato → copri tutto; pubblico/join → quota equa.
  useEffect(() => {
    if (!visible || !mode) return;
    setError('');
    setSuccess(false);
    setLastQR(null);
    setLoading(false);
    submitting.current = false;
    if (isOpen) {
      setVisibility('public');
      setShare(String(fairShare).replace('.', ','));
    } else {
      setShare(String(Math.min(fairShare, remaining)).replace('.', ','));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mode]);

  useEffect(() => {
    if (!success || !lastQR) return;
    ScreenCapture.preventScreenCaptureAsync().catch(() => {});
    return () => { ScreenCapture.allowScreenCaptureAsync().catch(() => {}); };
  }, [success, lastQR]);

  function handleClose() {
    setLoading(false);
    submitting.current = false;
    onClose();
  }

  function applyVisibility(v) {
    setVisibility(v);
    setError('');
    // Su un privato (senza ancora inviti) la scelta sensata è coprire il totale.
    setShare(String(v === 'private' ? total : fairShare).replace('.', ','));
  }

  function onPaid(qrCode) {
    setLastQR(qrCode);
    setSuccess(true);
    try {
      sendLocalNotification({
        title: t('tableModal.notifTitle'),
        body: `${event.title} — ${fmtDateFull(event.event_date)}`,
        data: { type: 'booking', event_id: event.id },
      });
    } catch {}
    supabase.functions.invoke('notify-new-booking', {
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: { event_id: event.id, user_id: session.user.id },
    }).catch(() => {});
    onSuccess?.();
  }

  async function handleConfirm() {
    if (submitting.current) return;
    if (!session) { setError(t('booking.sessionExpired')); return; }

    const shareNum = parseShare(share);
    if (!Number.isFinite(shareNum) || shareNum < TABLE_MIN_SHARE) {
      setError(`La quota minima è ${TABLE_MIN_SHARE} €.`);
      return;
    }
    if (shareNum > maxShare) {
      setError(`La quota non può superare ${euro(maxShare)}.`);
      return;
    }

    submitting.current = true;
    setLoading(true);
    setError('');

    try {
      const body = isOpen
        ? { eventId: event.id, accessToken: session.access_token, tableAction: 'open', typeId: type.id, visibility, share: shareNum, returnBase: API_URL }
        : { eventId: event.id, accessToken: session.access_token, tableAction: 'join', tableId: table.id, share: shareNum, returnBase: API_URL };

      const res = await fetch(`${API_URL}/api/stripe/checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.url) {
        setLoading(false);
        submitting.current = false;
        setError((json.code && t('serverErrors.' + json.code) !== 'serverErrors.' + json.code) ? t('serverErrors.' + json.code) : (json.error || t('booking.payCreateError')));
        return;
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
        onPaid(confirmJson.qrCode);
        return;
      }
      // 402 = pagamento non completato → vero annullamento: chiudi in silenzio.
      if (confirmRes.status === 402) return;
      // Altri esiti (refund automatici inclusi): il server manda già il messaggio giusto.
      setError(confirmJson.error || t('tableModal.confirmFailed'));
    } catch (e) {
      console.error('Errore checkout tavolo:', e);
      setLoading(false);
      submitting.current = false;
      setError(t('booking.connError'));
    }
  }

  if (!event || !mode) return null;

  const shareNum = parseShare(share);
  const validShare = Number.isFinite(shareNum) && shareNum >= TABLE_MIN_SHARE && shareNum <= maxShare;
  const typeName = isOpen ? type?.name : (table?.event_table_types?.name || t('booking.table'));

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
                {t('tableModal.joined')}
              </Text>
              <Text style={{ color: COLORS.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 20 }}>
                Mostra questo QR all'ingresso.{'\n'}Lo ritrovi sempre nella tab Biglietti.
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
                  <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 19, lineHeight: 24, letterSpacing: -0.3 }}>
                    {isOpen ? t('tableModal.openTitle', { name: typeName }) : t('tableModal.joinTitle', { name: typeName })}
                  </Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 4 }}>
                    {event.title} · totale tavolo {euro(total)}
                  </Text>
                </View>
                <Pressable onPress={handleClose} hitSlop={10}>
                  <Ionicons name="close" size={22} color={COLORS.textMuted} />
                </Pressable>
              </View>

              <View style={{ height: 1, backgroundColor: COLORS.borderSubtle, marginVertical: 16 }} />

              {/* Visibilità (solo apertura) */}
              {isOpen && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>
                    {t('tableModal.whoCanJoin')}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {[
                      { id: 'public',  label: t('tableModal.visPublic'), sub: t('tableModal.visPublicSub') },
                      { id: 'private', label: t('tableModal.visPrivate'),  sub: t('tableModal.visPrivateSub') },
                    ].map(opt => {
                      const active = visibility === opt.id;
                      return (
                        <Pressable
                          key={opt.id}
                          onPress={() => applyVisibility(opt.id)}
                          style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: active ? '#FAFAFA' : COLORS.bgElev3 }}
                        >
                          <Text style={{ color: active ? COLORS.bg : COLORS.textSecondary, fontSize: 14, fontWeight: '700', marginBottom: 2 }}>
                            {opt.label}
                          </Text>
                          <Text style={{ color: active ? '#52525B' : COLORS.textMuted, fontSize: 11, lineHeight: 15 }}>
                            {opt.sub}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {visibility === 'private' && (
                    <Text style={{ color: COLORS.textDisabled, fontSize: 11, marginTop: 8, lineHeight: 15 }}>
                      Gli inviti agli amici arrivano a breve: per ora su un tavolo privato conviene coprire l'intero importo.
                    </Text>
                  )}
                </View>
              )}

              {/* Stato tavolo (solo join) */}
              {!isOpen && (
                <View style={{ flexDirection: 'row', gap: 18, marginBottom: 16 }}>
                  <View>
                    <Text style={{ color: COLORS.textMuted, fontSize: 11, marginBottom: 2 }}>{t('tableModal.people')}</Text>
                    <Text style={{ color: COLORS.textPrimary, fontWeight: '700', fontSize: 14 }}>{table.people_count}/{table.max_people}</Text>
                  </View>
                  <View>
                    <Text style={{ color: COLORS.textMuted, fontSize: 11, marginBottom: 2 }}>{t('tableModal.collected')}</Text>
                    <Text style={{ color: COLORS.textPrimary, fontWeight: '700', fontSize: 14 }}>{euro(Number(table.collected || 0))}</Text>
                  </View>
                  <View>
                    <Text style={{ color: COLORS.textMuted, fontSize: 11, marginBottom: 2 }}>{t('tableModal.remaining')}</Text>
                    <Text style={{ color: COLORS.warning, fontWeight: '700', fontSize: 14 }}>{euro(remaining)}</Text>
                  </View>
                </View>
              )}

              {/* Quota */}
              <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>
                {t('tableModal.yourShare')}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bgElev3, borderRadius: 12, paddingHorizontal: 14 }}>
                  <TextInput
                    value={share}
                    onChangeText={v => { setShare(v); setError(''); }}
                    keyboardType="decimal-pad"
                    placeholder={String(fairShare)}
                    placeholderTextColor={COLORS.textDisabled}
                    style={{ flex: 1, color: COLORS.textPrimary, fontSize: 20, fontWeight: '700', paddingVertical: 12 }}
                  />
                  <Text style={{ color: COLORS.textMuted, fontSize: 16, fontWeight: '600' }}>€</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                <Pressable
                  onPress={() => { setError(''); setShare(String(fairShare).replace('.', ',')); }}
                  style={{ backgroundColor: COLORS.bgElev3, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}
                >
                  <Text style={{ color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' }}>{t('tableModal.fairShare', { amount: euro(fairShare) })}</Text>
                </Pressable>
                <Pressable
                  onPress={() => { setError(''); setShare(String(remaining).replace('.', ',')); }}
                  style={{ backgroundColor: COLORS.bgElev3, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}
                >
                  <Text style={{ color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' }}>
                    {isOpen ? t('tableModal.payAll', { amount: euro(total) }) : t('tableModal.coverRest', { amount: euro(remaining) })}
                  </Text>
                </Pressable>
              </View>

              {/* Riepilogo */}
              <View style={{ paddingTop: 14, borderTopWidth: 1, borderTopColor: COLORS.borderSubtle, marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>{t('tableModal.share')}</Text>
                  <Text style={{ color: COLORS.textSecondary, fontSize: 13 }}>{validShare ? euro(shareNum) : '—'}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                  <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>{t('booking.fee')}</Text>
                  <Text style={{ color: COLORS.textSecondary, fontSize: 13 }}>{euro(BOOKING_FEE)}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase' }}>{t('booking.total')}</Text>
                  <Text style={{ fontFamily: FONT_FAMILY.displayHeavy, color: COLORS.textPrimary, fontSize: 24, letterSpacing: -0.4 }}>
                    {validShare ? euro(shareNum + BOOKING_FEE) : '—'}
                  </Text>
                </View>
              </View>

              <Text style={{ color: COLORS.textDisabled, fontSize: 11, textAlign: 'center', marginBottom: 14, lineHeight: 15 }}>
                Rimborso solo se il locale ti nega l'ingresso. Nessun rimborso per mancata presentazione.
              </Text>

              {error ? (
                <View style={{ backgroundColor: 'rgba(248,113,113,0.08)', borderRadius: 10, padding: 12, marginBottom: 14 }}>
                  <Text style={{ color: '#FCA5A5', fontSize: 13, textAlign: 'center', lineHeight: 18 }}>{error}</Text>
                </View>
              ) : null}

              <Pressable
                onPress={handleConfirm}
                disabled={loading || !validShare}
                style={({ pressed }) => ({
                  backgroundColor: validShare ? COLORS.brandStrong : COLORS.bgElev3,
                  paddingVertical: 16,
                  borderRadius: 14,
                  alignItems: 'center',
                  opacity: loading || pressed ? 0.75 : 1,
                })}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: validShare ? '#fff' : COLORS.textMuted, fontWeight: '800', fontSize: 16 }}>
                      {validShare ? t('booking.pay', { amount: euro(shareNum + BOOKING_FEE) }) : t('tableModal.enterShare')}
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
