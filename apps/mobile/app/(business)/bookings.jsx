import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { formatDateFull, formatTime } from '@lets-night/shared';

export default function BusinessBookings() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [venueId, setVenueId] = useState(null);
  const [events, setEvents] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState('all');
  const [checkingIn, setCheckingIn] = useState(null);

  async function loadData() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: v } = await supabase.from('venues').select('id').eq('owner_id', session.user.id).single();
    if (!v) { setLoading(false); return; }
    setVenueId(v.id);

    const [{ data: evs }, { data: bks }] = await Promise.all([
      supabase.from('events').select('id, title, event_date, event_time').eq('venue_id', v.id).order('event_date', { ascending: false }),
      supabase.from('bookings')
        .select('*, events!inner(id, title, event_date, event_time, venue_id), profiles(full_name, phone)')
        .eq('events.venue_id', v.id)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false }),
    ]);
    setEvents(evs || []);
    setBookings(bks || []);
    setLoading(false);
  }

  useFocusEffect(useCallback(() => { loadData(); }, []));
  const onRefresh = useCallback(async () => { setRefreshing(true); await loadData(); setRefreshing(false); }, []);

  async function handleCheckIn(bookingId, alreadyIn) {
    if (alreadyIn) return;
    setCheckingIn(bookingId);
    const { error } = await supabase.from('bookings').update({
      checked_in: true,
      checked_in_at: new Date().toISOString(),
    }).eq('id', bookingId);
    setCheckingIn(null);
    if (error) { Alert.alert('Errore', error.message); return; }
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, checked_in: true } : b));
  }

  const filtered = selectedEvent === 'all' ? bookings : bookings.filter(b => b.event_id === selectedEvent);
  const checkedInCount = filtered.filter(b => b.checked_in).length;

  if (loading) return <View style={{ flex: 1, backgroundColor: '#09090f', justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color="#A855F7" size="large" /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: '#09090f' }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 }}>
        <Text style={{ color: '#A855F7', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>Gestione</Text>
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900', marginBottom: 4 }}>Prenotazioni</Text>
        <Text style={{ color: '#64748B', fontSize: 13 }}>
          {filtered.length} totali · <Text style={{ color: '#4ADE80' }}>{checkedInCount} check-in</Text>
        </Text>

        {/* Event filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[{ id: 'all', title: 'Tutti gli eventi' }, ...events].map(ev => (
              <Pressable key={ev.id} onPress={() => setSelectedEvent(ev.id)}
                style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: selectedEvent === ev.id ? '#7C3AED' : '#18181f', borderWidth: 1, borderColor: selectedEvent === ev.id ? '#7C3AED' : 'rgba(168,85,247,0.2)' }}
              >
                <Text style={{ color: selectedEvent === ev.id ? '#fff' : '#9CA3AF', fontSize: 12, fontWeight: selectedEvent === ev.id ? '700' : '400' }} numberOfLines={1}>
                  {ev.id === 'all' ? 'Tutti gli eventi' : ev.title}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#A855F7" />}>
        {filtered.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 48 }}>
            <Text style={{ color: '#64748B', fontSize: 14 }}>Nessuna prenotazione.</Text>
          </View>
        ) : filtered.map(b => (
          <View key={b.id} style={{ backgroundColor: '#111118', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: b.checked_in ? 'rgba(74,222,128,0.2)' : 'rgba(168,85,247,0.12)' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14, marginBottom: 2 }}>
                  {b.profiles?.full_name || 'Utente'}
                </Text>
                <Text style={{ color: '#64748B', fontSize: 12, marginBottom: 2 }}>{b.profiles?.phone || 'Nessun telefono'}</Text>
                <Text style={{ color: '#A855F7', fontSize: 11, marginBottom: 6 }} numberOfLines={1}>{b.events?.title}</Text>
                <Text style={{ color: '#9CA3AF', fontSize: 11 }}>
                  {formatDateFull(b.events?.event_date)} · {formatTime(b.events?.event_time)}
                </Text>
                <Text style={{ color: '#9CA3AF', fontSize: 11, marginTop: 2 }}>
                  {b.quantity} {b.quantity > 1 ? 'posti' : 'posto'} · EUR {b.total_price}
                </Text>
              </View>
              <Pressable
                onPress={() => handleCheckIn(b.id, b.checked_in)}
                disabled={b.checked_in || checkingIn === b.id}
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: b.checked_in ? 'rgba(74,222,128,0.12)' : '#7C3AED', borderWidth: 1, borderColor: b.checked_in ? 'rgba(74,222,128,0.3)' : '#7C3AED', minWidth: 80, alignItems: 'center' }}
              >
                {checkingIn === b.id
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={{ color: b.checked_in ? '#4ADE80' : '#fff', fontWeight: '700', fontSize: 12 }}>
                      {b.checked_in ? '✓ Entrato' : 'Check-in'}
                    </Text>
                }
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
