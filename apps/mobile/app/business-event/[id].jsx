import { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { formatDateFull, formatTime, getPriceLabel } from '@lets-night/shared';

const FILTERS = [
  { id: 'all',     label: 'Tutti' },
  { id: 'ticket',  label: 'Biglietti' },
  { id: 'table',   label: 'Tavoli' },
  { id: 'checked', label: '✓ Entrati' },
];

const GENDER_LABEL = { M: 'M', F: 'F', X: 'X' };

function calcAge(birthDate) {
  if (!birthDate) return null;
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age < 0 ? null : age;
}

export default function BusinessEventDetailScreen() {
  const { id } = useLocalSearchParams();
  const [event, setEvent] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [checkingIn, setCheckingIn] = useState(null);

  async function loadData() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace('/auth/login'); return; }

    // Verifica ownership: l'evento deve appartenere a un venue dell'utente
    const { data: ev } = await supabase
      .from('events')
      .select('*, venues!inner(id, name, zona, city, owner_id)')
      .eq('id', id)
      .single();

    if (!ev || ev.venues.owner_id !== session.user.id) {
      Alert.alert('Accesso negato', 'Questo evento non appartiene al tuo locale.');
      router.back();
      return;
    }
    setEvent(ev);

    const { data: bks } = await supabase
      .from('bookings')
      .select('*, profiles(full_name, phone, birth_date, gender)')
      .eq('event_id', id)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false });
    setBookings(bks || []);
  }

  useFocusEffect(useCallback(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [id]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [id]);

  async function toggleCheckIn(bookingId, alreadyIn) {
    setCheckingIn(bookingId);
    const { error } = await supabase.from('bookings').update({
      checked_in: !alreadyIn,
      checked_in_at: !alreadyIn ? new Date().toISOString() : null,
    }).eq('id', bookingId);
    setCheckingIn(null);
    if (error) { Alert.alert('Errore', error.message); return; }
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, checked_in: !alreadyIn } : b));
  }

  const filtered = useMemo(() => {
    if (filter === 'all') return bookings;
    if (filter === 'ticket') return bookings.filter(b => (b.booking_type || 'ticket') === 'ticket');
    if (filter === 'table') return bookings.filter(b => b.booking_type === 'table');
    if (filter === 'checked') return bookings.filter(b => b.checked_in);
    return bookings;
  }, [bookings, filter]);

  const stats = useMemo(() => {
    const tickets = bookings.filter(b => (b.booking_type || 'ticket') === 'ticket');
    const tables = bookings.filter(b => b.booking_type === 'table');
    const checkedIn = bookings.filter(b => b.checked_in).length;
    const totalGuests = bookings.reduce((s, b) => s + (b.quantity || 1), 0);
    const revenue = bookings
      .filter(b => b.status === 'confirmed')
      .reduce((s, b) => s + parseFloat(b.total_price || 0), 0);
    return {
      tickets: tickets.length,
      tables: tables.length,
      checkedIn,
      totalGuests,
      revenue,
    };
  }, [bookings]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#09090f', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#A855F7" size="large" />
      </View>
    );
  }

  if (!event) return null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#09090f' }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#A855F7" />}
    >
      {/* Header evento */}
      <View style={{ padding: 20, paddingTop: 16 }}>
        <Text style={{ color: '#A855F7', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>
          {event.category}
        </Text>
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900', lineHeight: 28 }}>{event.title}</Text>
        <Text style={{ color: '#9CA3AF', fontSize: 13, marginTop: 6 }}>
          {formatDateFull(event.event_date)} · {formatTime(event.event_time)}
        </Text>
        <Text style={{ color: '#64748B', fontSize: 12, marginTop: 4 }}>
          📍 {event.venues?.name} · {event.venues?.zona}, {event.venues?.city}
        </Text>
      </View>

      {/* Stats grid */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, gap: 10, marginBottom: 16 }}>
        <StatCard label="Biglietti" value={stats.tickets} color="#A855F7" />
        <StatCard label="Tavoli" value={stats.tables} color="#FBBF24" />
        <StatCard label="Check-in" value={`${stats.checkedIn}/${bookings.length}`} color="#4ADE80" />
        <StatCard label="Entrate" value={`EUR ${stats.revenue.toFixed(0)}`} color="#60A5FA" />
        <StatCard label="Ospiti tot." value={stats.totalGuests} color="#C084FC" />
        {event.capacity && (
          <StatCard label="Capienza" value={`${event.booked_count || 0}/${event.capacity}`} color="#F87171" />
        )}
      </View>

      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingBottom: 12 }}>
        {FILTERS.map(f => {
          const active = filter === f.id;
          return (
            <Pressable key={f.id} onPress={() => setFilter(f.id)}
              style={{
                paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16,
                backgroundColor: active ? '#7C3AED' : '#18181f',
                borderWidth: 1, borderColor: active ? '#7C3AED' : 'rgba(168,85,247,0.2)',
              }}>
              <Text style={{ color: active ? '#fff' : '#9CA3AF', fontSize: 12, fontWeight: active ? '700' : '500' }}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Lista nominativa */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 60 }}>
        <Text style={{ color: '#64748B', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>
          Lista ospiti ({filtered.length})
        </Text>

        {filtered.length === 0 ? (
          <View style={{
            backgroundColor: '#111118', borderRadius: 12, padding: 28,
            alignItems: 'center', borderWidth: 1, borderColor: 'rgba(168,85,247,0.12)',
          }}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>👥</Text>
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', marginBottom: 4 }}>
              Nessun ospite per questo filtro
            </Text>
            <Text style={{ color: '#64748B', fontSize: 12, textAlign: 'center' }}>
              {bookings.length === 0
                ? 'Nessuna prenotazione ancora per questo evento.'
                : 'Cambia il filtro per vedere altri ospiti.'}
            </Text>
          </View>
        ) : filtered.map(b => {
          const age = calcAge(b.profiles?.birth_date);
          const isTable = b.booking_type === 'table';
          return (
            <View key={b.id} style={{
              backgroundColor: '#111118', borderRadius: 12, padding: 14,
              marginBottom: 8,
              borderWidth: 1,
              borderColor: b.checked_in ? 'rgba(74,222,128,0.3)' : 'rgba(168,85,247,0.12)',
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{
                  width: 40, height: 40, borderRadius: 20,
                  backgroundColor: isTable ? 'rgba(251,191,36,0.18)' : 'rgba(168,85,247,0.18)',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 18 }}>{isTable ? '🍾' : '🎟️'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }} numberOfLines={1}>
                    {b.profiles?.full_name || 'Utente'}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
                    {b.profiles?.gender && (
                      <Text style={{ color: '#A855F7', fontSize: 11, fontWeight: '700' }}>
                        {GENDER_LABEL[b.profiles.gender]}
                      </Text>
                    )}
                    {age != null && (
                      <Text style={{ color: '#9CA3AF', fontSize: 11 }}>{age} anni</Text>
                    )}
                    <Text style={{ color: '#64748B', fontSize: 11 }}>·</Text>
                    <Text style={{ color: '#64748B', fontSize: 11 }}>
                      {isTable ? `Tavolo (${b.quantity})` : `${b.quantity} ingresso${b.quantity > 1 ? 'i' : ''}`}
                    </Text>
                  </View>
                  {b.profiles?.phone && (
                    <Text style={{ color: '#64748B', fontSize: 11, marginTop: 2 }} selectable>
                      {b.profiles.phone}
                    </Text>
                  )}
                </View>
                <Pressable
                  onPress={() => toggleCheckIn(b.id, b.checked_in)}
                  disabled={checkingIn === b.id}
                  style={{
                    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
                    backgroundColor: b.checked_in ? 'rgba(74,222,128,0.15)' : '#7C3AED',
                    borderWidth: 1,
                    borderColor: b.checked_in ? 'rgba(74,222,128,0.4)' : '#7C3AED',
                    minWidth: 64, alignItems: 'center',
                  }}>
                  {checkingIn === b.id ? <ActivityIndicator color="#fff" size="small" /> : (
                    <Text style={{ color: b.checked_in ? '#4ADE80' : '#fff', fontSize: 11, fontWeight: '800' }}>
                      {b.checked_in ? '✓ Entrato' : 'Check-in'}
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function StatCard({ label, value, color }) {
  return (
    <View style={{
      width: '47%', backgroundColor: '#111118',
      borderRadius: 12, padding: 14,
      borderWidth: 1, borderColor: 'rgba(168,85,247,0.12)',
    }}>
      <Text style={{ color, fontSize: 22, fontWeight: '900' }}>{value}</Text>
      <Text style={{ color: '#64748B', fontSize: 11, marginTop: 4 }}>{label}</Text>
    </View>
  );
}
