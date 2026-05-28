import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { formatDateFull, formatTime, getPriceLabel, isPastDate } from '@lets-night/shared';

function TicketCard({ booking, onPress }) {
  const event = booking.events;
  const past = event ? isPastDate(event.event_date) : false;

  const statusColor = {
    confirmed: '#4ADE80',
    pending: '#FBBF24',
    cancelled: '#F87171',
  }[booking.status] || '#9CA3AF';

  const statusLabel = {
    confirmed: 'Confermato',
    pending: 'In attesa',
    cancelled: 'Annullato',
  }[booking.status] || booking.status;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: '#18181f',
        borderRadius: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: past ? 'rgba(168,85,247,0.06)' : 'rgba(168,85,247,0.18)',
        overflow: 'hidden',
        opacity: pressed ? 0.85 : past ? 0.65 : 1,
      })}
    >
      {/* Accent line */}
      <View style={{ height: 3, backgroundColor: past ? '#374151' : '#7C3AED' }} />

      <View style={{ padding: 16 }}>
        {/* Header row */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={{ color: '#A855F7', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 3 }}>
              {event?.venues?.name || 'Locale'}
            </Text>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800', lineHeight: 20 }} numberOfLines={2}>
              {event?.title || 'Evento'}
            </Text>
          </View>
          <View style={{ backgroundColor: past ? 'rgba(55,65,81,0.4)' : 'rgba(74,222,128,0.1)', borderWidth: 1, borderColor: past ? 'rgba(55,65,81,0.6)' : `${statusColor}40`, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
            <Text style={{ color: past ? '#6B7280' : statusColor, fontSize: 11, fontWeight: '700' }}>
              {past ? 'Passato' : statusLabel}
            </Text>
          </View>
        </View>

        {/* Date + time */}
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <View>
            <Text style={{ color: '#64748B', fontSize: 11, marginBottom: 2 }}>Data</Text>
            <Text style={{ color: past ? '#6B7280' : '#fff', fontWeight: '600', fontSize: 13 }}>
              {event ? formatDateFull(event.event_date) : '—'}
            </Text>
          </View>
          {event?.event_time && (
            <View>
              <Text style={{ color: '#64748B', fontSize: 11, marginBottom: 2 }}>Orario</Text>
              <Text style={{ color: past ? '#6B7280' : '#fff', fontWeight: '600', fontSize: 13 }}>
                {formatTime(event.event_time)}
              </Text>
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(168,85,247,0.08)' }}>
          <Text style={{ color: '#64748B', fontSize: 12 }}>
            {event?.venues?.zona}, {event?.venues?.city}
          </Text>
          <Text style={{ color: past ? '#6B7280' : '#A855F7', fontWeight: '700', fontSize: 14 }}>
            {event ? getPriceLabel(event.price) : '—'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function TicketsScreen() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [bookings, setBookings] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoadingAuth(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  async function fetchBookings(userId) {
    const { data, error } = await supabase
      .from('bookings')
      .select('*, events(id, title, event_date, event_time, price, venues(name, zona, city))')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) console.error('Errore bookings:', error);
    setBookings(data || []);
  }

  useEffect(() => {
    if (!session) { setBookings([]); return; }
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
      <View style={{ flex: 1, backgroundColor: '#0a0a0f', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#A855F7" />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0a0f', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
        <Text style={{ fontSize: 44, marginBottom: 16 }}>🎟️</Text>
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: -0.5, textAlign: 'center', marginBottom: 8 }}>
          I tuoi biglietti
        </Text>
        <Text style={{ color: '#64748B', fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 32 }}>
          Accedi per vedere le tue prenotazioni e i biglietti degli eventi.
        </Text>
        <Pressable
          onPress={() => router.push('/auth/login')}
          style={({ pressed }) => ({
            backgroundColor: '#7C3AED',
            paddingHorizontal: 32,
            paddingVertical: 14,
            borderRadius: 10,
            width: '100%',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15, textAlign: 'center' }}>Accedi</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/auth/register')}
          style={({ pressed }) => ({
            marginTop: 12,
            paddingVertical: 14,
            width: '100%',
            borderWidth: 1.5,
            borderColor: 'rgba(168,85,247,0.3)',
            borderRadius: 10,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: '#A855F7', fontWeight: '600', fontSize: 14, textAlign: 'center' }}>
            Registrati gratis
          </Text>
        </Pressable>
      </View>
    );
  }

  const today = new Date().toISOString().split('T')[0];
  const upcoming = bookings.filter(b => b.events && b.events.event_date >= today && b.status !== 'cancelled');
  const past = bookings.filter(b => b.events && (b.events.event_date < today || b.status === 'cancelled'));

  return (
    <View style={{ flex: 1, backgroundColor: '#0a0a0f' }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(168,85,247,0.12)' }}>
        <Text style={{ color: '#A855F7', fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 5 }}>
          I tuoi acquisti
        </Text>
        <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900', letterSpacing: -0.5 }}>
          Biglietti
        </Text>
      </View>

      {loadingBookings ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#A855F7" size="large" />
        </View>
      ) : bookings.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🎟️</Text>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' }}>
            Nessuna prenotazione
          </Text>
          <Text style={{ color: '#64748B', fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 28 }}>
            Prenota il tuo primo evento e lo troverai qui.
          </Text>
          <Pressable
            onPress={() => router.push('/(tabs)')}
            style={({ pressed }) => ({
              backgroundColor: '#7C3AED',
              paddingHorizontal: 28,
              paddingVertical: 12,
              borderRadius: 10,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Scopri eventi</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#A855F7" />}
        >
          {upcoming.length > 0 && (
            <View style={{ marginBottom: 28 }}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800', marginBottom: 14 }}>
                Prossimi ({upcoming.length})
              </Text>
              {upcoming.map(b => (
                <TicketCard
                  key={b.id}
                  booking={b}
                  onPress={() => b.events?.id && router.push(`/event/${b.events.id}`)}
                />
              ))}
            </View>
          )}

          {past.length > 0 && (
            <View>
              <Text style={{ color: '#64748B', fontSize: 14, fontWeight: '700', marginBottom: 14 }}>
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
        </ScrollView>
      )}
    </View>
  );
}
