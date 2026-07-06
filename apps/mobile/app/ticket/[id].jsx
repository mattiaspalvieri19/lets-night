import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, Modal, ActivityIndicator, Linking, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import * as ScreenCapture from 'expo-screen-capture';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { API_URL } from '../../lib/apiUrl';
import { COLORS, COLORS_BY_CAT, FONT_FAMILY, formatTime, isPastDate } from '@lets-night/shared';
import { useI18n } from '../../lib/i18n';

const STATUS = {
  confirmed: { labelKey: 'tickets.statusConfirmed', color: COLORS.success },
  pending:   { labelKey: 'tickets.statusPending', color: COLORS.warning },
  cancelled: { labelKey: 'tickets.statusCancelled', color: COLORS.danger },
  denied:    { labelKey: 'tickets.statusRefunded', color: COLORS.danger },
};

export default function TicketDetailScreen() {
  const { t, fmtDateFull, fmtPrice } = useI18n();
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [refundRequested, setRefundRequested] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      // La RLS restituisce solo la PROPRIA prenotazione → non si possono vedere biglietti altrui.
      const { data, error } = await supabase
        .from('bookings')
        .select('*, events(id, title, description, event_date, event_time, end_time, category, cover_image, price, venues(id, name, zona, city, address, cover_image)), event_tables(people_count, max_people, collected, total_price, event_table_types(name))')
        .eq('id', id)
        .maybeSingle();
      if (error || !data) { setNotFound(true); setLoading(false); return; }
      setBooking(data);
      setRefundRequested(!!data.refund_requested_at);
      setLoading(false);
    }
    load();
  }, [id]);

  // Anti-screenshot mentre il QR (anche ingrandito) è a schermo.
  useEffect(() => {
    if (!booking?.qr_code) return;
    ScreenCapture.preventScreenCaptureAsync().catch(() => {});
    return () => { ScreenCapture.allowScreenCaptureAsync().catch(() => {}); };
  }, [booking?.qr_code, zoom]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={COLORS.brand} />
      </View>
    );
  }

  if (notFound || !booking) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
        <Ionicons name="ticket-outline" size={40} color={COLORS.textMuted} style={{ marginBottom: 12 }} />
        <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 18, marginBottom: 18 }}>{t('ticketDetail.notFound')}</Text>
        <Pressable onPress={() => router.back()} style={{ backgroundColor: COLORS.brandStrong, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{t('ticketDetail.goBack')}</Text>
        </Pressable>
      </View>
    );
  }

  const event = booking.events;
  const venue = event?.venues;
  const past = event ? isPastDate(event.event_date) : false;
  const isTable = booking.booking_type === 'table_share';
  const accent = (COLORS_BY_CAT[event?.category] || [])[2] || COLORS.brand;
  const photo = event?.cover_image || venue?.cover_image || null;
  const st = STATUS[booking.status] || { label: booking.status, color: COLORS.textSecondary };
  const showQR = !!booking.qr_code && booking.status === 'confirmed';

  // Rimborso no-show: a pagamento, non entrato, prenotazione attiva e serata già passata
  // (gate preciso sull'orario di fine fatto dal server). Mostrato dal giorno dell'evento in poi.
  const todayRome = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
  const refundPending = refundRequested || !!booking.refund_requested_at;
  const canRequestRefund =
    booking.status === 'confirmed' &&
    !booking.checked_in &&
    Number(booking.total_price) > 0 &&
    !!event?.event_date && event.event_date <= todayRome &&
    !refundPending;

  function openMaps() {
    const q = encodeURIComponent(venue?.address || `${venue?.name || ''} ${venue?.city || ''}`.trim());
    if (q) Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`).catch(() => {});
  }

  async function handleRequestRefund() {
    setRequesting(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setRequesting(false); Alert.alert(t('ticketDetail.sessionExpired'), t('ticketDetail.reloginBody')); return; }
    try {
      const res = await fetch(`${API_URL}/api/refund/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id, accessToken: session.access_token }),
      });
      const json = await res.json();
      setRequesting(false);
      if (!res.ok) { Alert.alert(t('ticketDetail.reqFailTitle'), json.error || t('common.retry')); return; }
      setRefundRequested(true);
      Alert.alert(t('ticketDetail.reqSentTitle'), t('ticketDetail.reqSentBody'));
    } catch {
      setRequesting(false);
      Alert.alert(t('tickets.connErrorTitle'), t('ticketDetail.connErrorBody'));
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* Pass d'ingresso: il QR è il protagonista */}
        <View style={{ paddingHorizontal: 20, paddingTop: 18 }}>
          <View style={{ backgroundColor: COLORS.bgElev2, borderRadius: 22, borderWidth: 1, borderColor: COLORS.borderSubtle, padding: 22, alignItems: 'center' }}>
            <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>
              {isTable ? t('tickets.qrTable') : t('tickets.qrEntry')}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 18 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: past ? COLORS.textMuted : st.color }} />
              <Text style={{ color: past ? COLORS.textMuted : st.color, fontSize: 13, fontWeight: '700' }}>
                {past ? t('ticketDetail.pastEvent') : t(st.labelKey)}
              </Text>
            </View>

            {showQR ? (
              <>
                <Pressable onPress={() => setZoom(true)} style={({ pressed }) => ({ backgroundColor: '#fff', padding: 16, borderRadius: 18, opacity: pressed ? 0.9 : 1 })}>
                  <QRCode value={booking.qr_code} size={210} />
                </Pressable>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 }}>
                  <Ionicons name="expand-outline" size={14} color={COLORS.textMuted} />
                  <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>{t('ticketDetail.tapToEnlarge')}</Text>
                </View>
                <Text style={{ color: COLORS.textDisabled, fontSize: 11, marginTop: 6, textAlign: 'center' }}>
                  Mostra questo QR all&apos;ingresso del locale
                </Text>
              </>
            ) : (
              <View style={{ alignItems: 'center', paddingVertical: 18 }}>
                <Ionicons name={booking.status === 'denied' ? 'cash-outline' : 'close-circle-outline'} size={40} color={COLORS.textMuted} />
                <Text style={{ color: COLORS.textSecondary, fontSize: 14, fontWeight: '600', marginTop: 10, textAlign: 'center' }}>
                  {booking.status === 'denied' ? t('ticketDetail.refunded') : booking.status === 'cancelled' ? t('ticketDetail.cancelledB') : t('ticketDetail.invalid')}
                </Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 4, textAlign: 'center' }}>{t('ticketDetail.invalidSub')}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Rimborso no-show: utente non entrato, dopo la fine serata, previa approvazione */}
        {(canRequestRefund || refundPending) && (
          <View style={{ paddingHorizontal: 20, marginTop: 18 }}>
            {refundPending ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.bgElev1, borderRadius: 14, borderWidth: 1, borderColor: COLORS.borderSubtle, padding: 14 }}>
                <Ionicons name="time-outline" size={18} color={COLORS.warning} />
                <Text style={{ color: COLORS.textSecondary, fontSize: 13, flex: 1, lineHeight: 18 }}>{t('ticketDetail.refundPending')}</Text>
              </View>
            ) : (
              <>
                <Pressable onPress={handleRequestRefund} disabled={requesting}
                  style={({ pressed }) => ({ paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: COLORS.borderStrong, alignItems: 'center', opacity: requesting || pressed ? 0.6 : 1 })}>
                  {requesting
                    ? <ActivityIndicator color={COLORS.textSecondary} />
                    : <Text style={{ color: COLORS.textSecondary, fontSize: 14, fontWeight: '600' }}>{t('ticketDetail.requestRefund')}</Text>}
                </Pressable>
                <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 8, textAlign: 'center', lineHeight: 16 }}>
                  Solo se non hai effettuato l&apos;ingresso. Ti verrà rimborsato il prezzo del biglietto al netto delle commissioni (di servizio e di pagamento), non rimborsabili. Soggetto ad approvazione.
                </Text>
              </>
            )}
          </View>
        )}

        {/* Dettagli evento */}
        <View style={{ paddingHorizontal: 20, marginTop: 22 }}>
          <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 }}>
            Evento
          </Text>

          {/* Cover compatta */}
          <View style={{ height: 150, borderRadius: 16, overflow: 'hidden', backgroundColor: COLORS.bgElev1, marginBottom: 14 }}>
            {photo ? (
              <Image source={{ uri: photo }} resizeMode="cover" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
            ) : (
              <>
                <View style={{ position: 'absolute', top: -50, right: -40, width: 200, height: 200, borderRadius: 100, backgroundColor: accent, opacity: 0.1 }} />
                <Text numberOfLines={1} style={{ position: 'absolute', bottom: -10, left: -2, fontFamily: FONT_FAMILY.displayHeavy, fontSize: 76, letterSpacing: -3, color: accent, opacity: 0.18 }}>
                  {(event?.category || 'NIGHT').toUpperCase()}
                </Text>
              </>
            )}
          </View>

          <Text style={{ fontFamily: FONT_FAMILY.displayHeavy, color: COLORS.textPrimary, fontSize: 24, lineHeight: 28, letterSpacing: -0.5, marginBottom: 14 }}>
            {event?.title || t('common.event')}
          </Text>

          {/* Riga data/ora */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <Ionicons name="calendar-outline" size={18} color={COLORS.brand} />
            <Text style={{ color: COLORS.textSecondary, fontSize: 14 }}>
              {event ? fmtDateFull(event.event_date) : '—'}{event?.event_time ? ` · ${formatTime(event.event_time)}` : ''}
            </Text>
          </View>

          {/* Riga locale + luogo (tap → mappe) */}
          <Pressable onPress={openMaps} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12, opacity: pressed ? 0.6 : 1 })}>
            <Ionicons name="location-outline" size={18} color={COLORS.brand} style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.textPrimary, fontSize: 14, fontWeight: '600' }}>{venue?.name || t('common.venue')}</Text>
              <Text style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 2 }}>
                {[venue?.address, venue?.zona, venue?.city].filter(Boolean).join(', ') || '—'}
              </Text>
              <Text style={{ color: COLORS.brand, fontSize: 12, fontWeight: '600', marginTop: 4 }}>{t('ticketDetail.openInMaps')}</Text>
            </View>
          </Pressable>

          {/* Quota/prezzo */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <Ionicons name="pricetag-outline" size={18} color={COLORS.brand} />
            <Text style={{ color: COLORS.textSecondary, fontSize: 14 }}>
              {isTable ? t('ticketDetail.tableShare') : ''}{fmtPrice(booking.total_price != null ? booking.total_price : event?.price)}
              {isTable && booking.event_tables ? `  ·  ${booking.event_tables.event_table_types?.name || t('eventDetail.tableFallback')}` : ''}
            </Text>
          </View>

          {/* Descrizione */}
          {event?.description ? (
            <>
              <View style={{ height: 1, backgroundColor: COLORS.borderSubtle, marginBottom: 16 }} />
              <Text style={{ color: COLORS.textSecondary, fontSize: 14, lineHeight: 22 }}>
                {event.description}
              </Text>
            </>
          ) : null}

          {/* Link al dettaglio evento pubblico (facoltativo) */}
          {event?.id && (
            <Pressable
              onPress={() => router.push(`/event/${event.id}`)}
              style={({ pressed }) => ({ marginTop: 22, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: COLORS.borderStrong, alignItems: 'center', opacity: pressed ? 0.7 : 1 })}
            >
              <Text style={{ color: COLORS.textSecondary, fontSize: 14, fontWeight: '600' }}>{t('ticketDetail.seeEvent')}</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      {/* QR a schermo intero */}
      <Modal visible={zoom} transparent animationType="fade" onRequestClose={() => setZoom(false)}>
        <Pressable onPress={() => setZoom(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 18 }}>
            {isTable ? t('tickets.qrTable') : t('tickets.qrEntry')} · {event?.title}
          </Text>
          <View style={{ backgroundColor: '#fff', padding: 22, borderRadius: 22 }}>
            {booking.qr_code ? <QRCode value={booking.qr_code} size={280} /> : null}
          </View>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 20 }}>{t('ticketDetail.tapToClose')}</Text>
        </Pressable>
      </Modal>
    </View>
  );
}
