import { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, Modal } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as ScreenCapture from 'expo-screen-capture';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';
import { COLORS, FONT_FAMILY, formatDateFull, formatTime, getPriceLabel, isPastDate } from '@lets-night/shared';
import LoyaltyBlock from '../../components/LoyaltyBlock';

function TicketCard({ booking, onPress, onShowQR }) {
  const event = booking.events;
  const past = event ? isPastDate(event.event_date) : false;

  const statusColor = {
    confirmed: COLORS.success,
    pending: COLORS.warning,
    cancelled: COLORS.danger,
    denied: COLORS.danger,
  }[booking.status] || COLORS.textSecondary;

  const statusLabel = {
    confirmed: 'Confermato',
    pending: 'In attesa',
    cancelled: 'Annullato',
    denied: 'Rimborsato',
  }[booking.status] || booking.status;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: COLORS.bgElev2,
        borderRadius: 16,
        marginBottom: 10,
        overflow: 'hidden',
        opacity: pressed ? 0.85 : past ? 0.65 : 1,
      })}
    >
      <View style={{ padding: 16 }}>
        {/* Header row */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }}>
              {event?.venues?.name || 'Locale'}
            </Text>
            <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 16, lineHeight: 20, letterSpacing: -0.2 }} numberOfLines={2}>
              {event?.title || 'Evento'}
            </Text>
          </View>
          <View style={{ backgroundColor: past ? COLORS.bgElev3 : `${statusColor}14`, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
            <Text style={{ color: past ? COLORS.textMuted : statusColor, fontSize: 11, fontWeight: '700' }}>
              {past ? 'Passato' : statusLabel}
            </Text>
          </View>
        </View>

        {/* Date + time */}
        <View style={{ flexDirection: 'row', gap: 18 }}>
          <View>
            <Text style={{ color: COLORS.textMuted, fontSize: 11, marginBottom: 2 }}>Data</Text>
            <Text style={{ color: past ? COLORS.textMuted : COLORS.textPrimary, fontWeight: '600', fontSize: 13 }}>
              {event ? formatDateFull(event.event_date) : '—'}
            </Text>
          </View>
          {event?.event_time && (
            <View>
              <Text style={{ color: COLORS.textMuted, fontSize: 11, marginBottom: 2 }}>Orario</Text>
              <Text style={{ color: past ? COLORS.textMuted : COLORS.textPrimary, fontWeight: '600', fontSize: 13 }}>
                {formatTime(event.event_time)}
              </Text>
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.borderSubtle }}>
          <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>
            {event?.venues?.zona}, {event?.venues?.city}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ color: past ? COLORS.textMuted : COLORS.textPrimary, fontWeight: '700', fontSize: 14 }}>
              {booking.total_price != null ? getPriceLabel(booking.total_price) : (event ? getPriceLabel(event.price) : '—')}
            </Text>
            {!past && booking.qr_code && onShowQR && (
              <Pressable
                onPress={onShowQR}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.brandSubtle, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}
              >
                <Ionicons name="qr-code-outline" size={12} color={COLORS.brand} />
                <Text style={{ color: COLORS.brand, fontSize: 12, fontWeight: '700' }}>QR</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default function TicketsScreen() {
  const router = useRouter();
  const { session, loading: loadingAuth } = useSession();
  const [bookings, setBookings] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [qrModal, setQrModal] = useState(null);
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const fetchSeqRef = useRef(0);

  useEffect(() => {
    if (!qrModal) return;
    ScreenCapture.preventScreenCaptureAsync().catch(() => {});
    return () => { ScreenCapture.allowScreenCaptureAsync().catch(() => {}); };
  }, [qrModal]);

  async function fetchBookings(userId) {
    const mySeq = ++fetchSeqRef.current;
    setFetchError(false);
    const [{ data, error }, { data: prof }] = await Promise.all([
      supabase
        .from('bookings')
        .select('*, events(id, title, event_date, event_time, price, venues(name, zona, city))')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('loyalty_points')
        .eq('id', userId)
        .maybeSingle(),
    ]);
    // Drop stale responses (login/logout in flight).
    if (mySeq !== fetchSeqRef.current) return;
    if (error) {
      console.error('Errore bookings:', error);
      setFetchError(true);
      return;
    }
    setBookings(data || []);
    setLoyaltyPoints(prof?.loyalty_points || 0);
  }

  useEffect(() => {
    if (!session) { setBookings([]); fetchSeqRef.current++; return; }
    setLoadingBookings(true);
    fetchBookings(session.user.id).finally(() => setLoadingBookings(false));
  }, [session]);

  const onRefresh = useCallback(async () => {
    if (!session) return;
    setRefreshing(true);
    await fetchBookings(session.user.id);
    setRefreshing(false);
  }, [session]);

  if (loadingAuth) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={COLORS.brand} />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
        <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: COLORS.bgElev2, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <Ionicons name="ticket-outline" size={32} color={COLORS.textSecondary} />
        </View>
        <Text style={{ fontFamily: FONT_FAMILY.displayHeavy, color: COLORS.textPrimary, fontSize: 23, letterSpacing: -0.4, textAlign: 'center', marginBottom: 8 }}>
          I tuoi biglietti
        </Text>
        <Text style={{ color: COLORS.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 30 }}>
          Accedi per vedere le tue prenotazioni e i biglietti degli eventi.
        </Text>
        <Pressable
          onPress={() => router.push('/auth/login')}
          style={({ pressed }) => ({
            backgroundColor: COLORS.brandStrong,
            paddingVertical: 15,
            borderRadius: 12,
            width: '100%',
            alignItems: 'center',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Accedi</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/auth/register')}
          style={({ pressed }) => ({
            marginTop: 10,
            paddingVertical: 15,
            width: '100%',
            borderWidth: 1,
            borderColor: COLORS.borderStrong,
            borderRadius: 12,
            alignItems: 'center',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: COLORS.textSecondary, fontWeight: '600', fontSize: 14 }}>
            Registrati gratis
          </Text>
        </Pressable>
      </View>
    );
  }

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const inactive = b => b.status === 'cancelled' || b.status === 'denied';
  const upcoming = bookings.filter(b => b.events && b.events.event_date >= today && !inactive(b));
  const past = bookings.filter(b => b.events && (b.events.event_date < today || inactive(b)));

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 64, paddingBottom: 18 }}>
        <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>
          I tuoi acquisti
        </Text>
        <Text style={{ fontFamily: FONT_FAMILY.displayHeavy, color: COLORS.textPrimary, fontSize: 28, letterSpacing: -0.6 }}>
          Biglietti
        </Text>
      </View>

      {loadingBookings ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={COLORS.brand} size="large" />
        </View>
      ) : fetchError ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
          <Ionicons name="cloud-offline-outline" size={36} color={COLORS.textMuted} style={{ marginBottom: 12 }} />
          <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 18, marginBottom: 8, textAlign: 'center' }}>
            Errore di connessione
          </Text>
          <Text style={{ color: COLORS.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 28 }}>
            Non riusciamo a caricare i tuoi biglietti. Controlla la connessione e riprova.
          </Text>
          <Pressable
            onPress={() => { setLoadingBookings(true); fetchBookings(session.user.id).finally(() => setLoadingBookings(false)); }}
            style={({ pressed }) => ({ backgroundColor: COLORS.brandStrong, paddingHorizontal: 28, paddingVertical: 13, borderRadius: 12, opacity: pressed ? 0.85 : 1 })}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Riprova</Text>
          </Pressable>
        </View>
      ) : bookings.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
          <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: COLORS.bgElev2, alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
            <Ionicons name="ticket-outline" size={32} color={COLORS.textSecondary} />
          </View>
          <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 18, marginBottom: 8, textAlign: 'center' }}>
            Nessuna prenotazione
          </Text>
          <Text style={{ color: COLORS.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 28 }}>
            Prenota il tuo primo evento e lo troverai qui.
          </Text>
          <Pressable
            onPress={() => router.push('/(tabs)')}
            style={({ pressed }) => ({
              backgroundColor: COLORS.brandStrong,
              paddingHorizontal: 28,
              paddingVertical: 13,
              borderRadius: 12,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Scopri eventi</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}
        >
          {/* Loyalty card sempre in evidenza */}
          <LoyaltyBlock points={loyaltyPoints} />

          <View style={{ paddingHorizontal: 20 }}>
          {upcoming.length > 0 && (
            <View style={{ marginBottom: 28 }}>
              <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 17, letterSpacing: -0.3, marginBottom: 12 }}>
                Prossimi ({upcoming.length})
              </Text>
              {upcoming.map(b => (
                <TicketCard
                  key={b.id}
                  booking={b}
                  onPress={() => b.events?.id && router.push(`/event/${b.events.id}`)}
                  onShowQR={b.qr_code ? () => setQrModal({ qr_code: b.qr_code, eventTitle: b.events?.title, eventDate: b.events ? formatDateFull(b.events.event_date) : '' }) : null}
                />
              ))}
            </View>
          )}

          {past.length > 0 && (
            <View>
              <Text style={{ color: COLORS.textMuted, fontSize: 13, fontWeight: '700', marginBottom: 12 }}>
                Passati ({past.length})
              </Text>
              {past.map(b => (
                <TicketCard
                  key={b.id}
                  booking={b}
                  onPress={() => b.events?.id && router.push(`/event/${b.events.id}`)}
                />
              ))}
            </View>
          )}
          </View>
        </ScrollView>
      )}
      {/* QR Modal */}
      <Modal visible={!!qrModal} transparent animationType="fade" onRequestClose={() => setQrModal(null)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}
          onPress={() => setQrModal(null)}
        >
          <Pressable style={{ backgroundColor: COLORS.bgElev2, borderRadius: 22, padding: 28, alignItems: 'center', width: '100%' }}>
            <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>Il tuo biglietto</Text>
            <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 18, textAlign: 'center', marginBottom: 4 }} numberOfLines={2}>{qrModal?.eventTitle}</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 13, marginBottom: 22 }}>{qrModal?.eventDate}</Text>
            <View style={{ backgroundColor: '#fff', padding: 16, borderRadius: 16, marginBottom: 20 }}>
              {qrModal?.qr_code ? <QRCode value={qrModal.qr_code} size={200} /> : null}
            </View>
            <Text style={{ color: COLORS.textMuted, fontSize: 12, textAlign: 'center', marginBottom: 20 }}>Mostra questo QR code all'ingresso</Text>
            <Pressable
              onPress={() => setQrModal(null)}
              style={({ pressed }) => ({ paddingVertical: 13, paddingHorizontal: 44, borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 12, opacity: pressed ? 0.7 : 1 })}
            >
              <Text style={{ color: COLORS.textSecondary, fontWeight: '700', fontSize: 14 }}>Chiudi</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
