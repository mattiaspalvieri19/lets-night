import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useI18n } from '../../lib/i18n';
import { Ionicons } from '@expo/vector-icons';
import { formatTime, COLORS, FONT_FAMILY } from '@lets-night/shared';

export default function BusinessBookings() {
  const { t, fmtDateFull } = useI18n();
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
    const { data: v } = await supabase.from('venues').select('id').eq('owner_id', session.user.id).maybeSingle();
    if (!v) { setLoading(false); return; }
    setVenueId(v.id);

    const [{ data: evs }, { data: bks }] = await Promise.all([
      supabase.from('events').select('id, title, event_date, event_time').eq('venue_id', v.id).order('event_date', { ascending: false }),
      supabase.from('bookings')
        .select('*, events!inner(id, title, event_date, event_time, venue_id), profiles(full_name, phone)')
        .eq('events.venue_id', v.id)
        .not('status', 'in', '("cancelled","denied")')
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
    // Conditional come lo scanner: se un altro device ha già fatto check-in, no-op.
    const { error } = await supabase.from('bookings').update({
      checked_in: true,
      checked_in_at: new Date().toISOString(),
    }).eq('id', bookingId).eq('checked_in', false);
    setCheckingIn(null);
    if (error) { Alert.alert(t('common.error'), error.message); return; }
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, checked_in: true } : b));
  }

  const filtered = selectedEvent === 'all' ? bookings : bookings.filter(b => b.event_id === selectedEvent);
  const checkedInCount = filtered.filter(b => b.checked_in).length;

  if (loading) return <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={COLORS.brand} size="large" /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 }}>
        <Text style={{ color: COLORS.brand, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>{t('biz.management')}</Text>
        <Text style={{ fontFamily: FONT_FAMILY.displayHeavy, color: '#fff', fontSize: 24, marginBottom: 4 }}>{t('biz.bookingsTitle')}</Text>
        <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>
          {filtered.length} totali · <Text style={{ color: COLORS.success }}>{checkedInCount} check-in</Text>
        </Text>

        {/* Event filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[{ id: 'all', title: t('biz.allEvents') }, ...events].map(ev => (
              <Pressable key={ev.id} onPress={() => setSelectedEvent(ev.id)}
                style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: selectedEvent === ev.id ? COLORS.textPrimary : COLORS.bgElev3, borderWidth: 1, borderColor: selectedEvent === ev.id ? COLORS.textPrimary : COLORS.borderSubtle }}
              >
                <Text style={{ color: selectedEvent === ev.id ? COLORS.bg : COLORS.textSecondary, fontSize: 12, fontWeight: selectedEvent === ev.id ? '700' : '400' }} numberOfLines={1}>
                  {ev.id === 'all' ? t('biz.allEvents') : ev.title}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}>
        {filtered.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 48 }}>
            <Text style={{ color: COLORS.textMuted, fontSize: 14 }}>{t('biz.noBookings')}</Text>
          </View>
        ) : filtered.map(b => (
          <View key={b.id} style={{ backgroundColor: COLORS.bgElev2, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: b.checked_in ? 'rgba(74,222,128,0.2)' : COLORS.borderSubtle }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontFamily: FONT_FAMILY.display, color: '#fff', fontSize: 14, marginBottom: 2 }}>
                  {b.profiles?.full_name || t('common.user')}
                </Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 2 }}>{b.profiles?.phone || t('biz.noPhone')}</Text>
                <Text style={{ color: COLORS.brand, fontSize: 11, marginBottom: 6 }} numberOfLines={1}>{b.events?.title}</Text>
                <Text style={{ color: COLORS.textSecondary, fontSize: 11 }}>
                  {fmtDateFull(b.events?.event_date)} · {formatTime(b.events?.event_time)}
                </Text>
                <Text style={{ color: COLORS.textSecondary, fontSize: 11, marginTop: 2 }}>
                  {b.quantity} {b.quantity > 1 ? 'posti' : 'posto'} · EUR {b.total_price}
                </Text>
              </View>
              <Pressable
                onPress={() => handleCheckIn(b.id, b.checked_in)}
                disabled={b.checked_in || checkingIn === b.id}
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: b.checked_in ? 'rgba(74,222,128,0.12)' : COLORS.brandStrong, borderWidth: 1, borderColor: b.checked_in ? 'rgba(74,222,128,0.3)' : COLORS.brandStrong, minWidth: 80, alignItems: 'center' }}
              >
                {checkingIn === b.id
                  ? <ActivityIndicator color="#fff" size="small" />
                  : b.checked_in
                    ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
                        <Text style={{ color: COLORS.success, fontWeight: '700', fontSize: 12 }}>{t('biz.checkedIn')}</Text>
                      </View>
                    : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{t('biz.checkIn')}</Text>
                }
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
