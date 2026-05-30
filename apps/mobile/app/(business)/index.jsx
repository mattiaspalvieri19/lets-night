import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { formatDateFull, formatTime } from '@lets-night/shared';

export default function BusinessDashboard() {
  const [loading, setLoading] = useState(true);
  const [venue, setVenue] = useState(null);
  const [todayEvents, setTodayEvents] = useState([]);
  const [stats, setStats] = useState({ todayCheckins: 0, weekBookings: 0, totalRevenue: 0, activeEvents: 0 });
  const [refreshing, setRefreshing] = useState(false);

  async function loadData() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/auth/login'); return; }

      const { data: venueData } = await supabase
        .from('venues').select('*').eq('owner_id', session.user.id).single();
      if (!venueData) { setLoading(false); return; }
      setVenue(venueData);

      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

      const [{ data: eventsToday }, { data: allEvents }, { data: bookings }] = await Promise.all([
        supabase.from('events').select('*, bookings(id, checked_in, status)')
          .eq('venue_id', venueData.id).eq('event_date', todayStr).eq('is_active', true),
        supabase.from('events').select('id, is_active').eq('venue_id', venueData.id),
        supabase.from('bookings')
          .select('*, events!inner(venue_id)')
          .eq('events.venue_id', venueData.id)
          .neq('status', 'cancelled')
          .gte('created_at', weekAgo),
      ]);

      setTodayEvents(eventsToday || []);

      const checkins = (eventsToday || []).flatMap(e => e.bookings || []).filter(b => b.checked_in && b.status !== 'cancelled').length;
      const revenue = (bookings || []).filter(b => b.status === 'confirmed').reduce((s, b) => s + parseFloat(b.total_price || 0), 0);

      setStats({
        todayCheckins: checkins,
        weekBookings: (bookings || []).length,
        totalRevenue: revenue,
        activeEvents: (allEvents || []).filter(e => e.is_active).length,
      });
    } catch (e) {
      console.error('Errore dashboard:', e);
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const onRefresh = useCallback(async () => { setRefreshing(true); await loadData(); setRefreshing(false); }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#09090f', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#A855F7" size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#09090f' }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#A855F7" />}
    >
      <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12 }}>
        <Text style={{ color: '#A855F7', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>Dashboard</Text>
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900' }}>{venue?.name}</Text>
        <Text style={{ color: '#64748B', fontSize: 13, marginTop: 2 }}>{venue?.zona}, {venue?.city}</Text>
        {!venue?.is_verified && (
          <View style={{ marginTop: 12, backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', borderRadius: 10, padding: 12 }}>
            <Text style={{ color: '#FBBF24', fontWeight: '700', fontSize: 13 }}>⏳ In attesa di approvazione</Text>
            <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 4 }}>Il team Let's Night verificherà il tuo locale entro 24-48 ore.</Text>
          </View>
        )}
      </View>

      {/* Stats */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, gap: 10, marginBottom: 24 }}>
        {[
          { label: 'Check-in oggi', value: stats.todayCheckins, color: '#4ADE80' },
          { label: 'Prenotazioni (7gg)', value: stats.weekBookings, color: '#A855F7' },
          { label: 'Entrate (7gg)', value: `€${stats.totalRevenue.toFixed(0)}`, color: '#FBBF24' },
          { label: 'Eventi attivi', value: stats.activeEvents, color: '#60A5FA' },
        ].map(s => (
          <View key={s.label} style={{ width: '47%', backgroundColor: '#111118', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(168,85,247,0.12)' }}>
            <Text style={{ color: s.color, fontSize: 26, fontWeight: '900', marginBottom: 4 }}>{s.value}</Text>
            <Text style={{ color: '#64748B', fontSize: 12 }}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Today's events */}
      <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800', marginBottom: 12 }}>Oggi</Text>
        {todayEvents.length === 0 ? (
          <View style={{ backgroundColor: '#111118', borderRadius: 14, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(168,85,247,0.1)' }}>
            <Text style={{ color: '#64748B', fontSize: 14 }}>Nessun evento oggi</Text>
          </View>
        ) : (
          todayEvents.map(ev => {
            const checkedIn = (ev.bookings || []).filter(b => b.checked_in).length;
            const total = (ev.bookings || []).filter(b => b.status !== 'cancelled').length;
            return (
              <View key={ev.id} style={{ backgroundColor: '#111118', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(168,85,247,0.15)' }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15, marginBottom: 4 }}>{ev.title}</Text>
                <Text style={{ color: '#A855F7', fontSize: 13, marginBottom: 8 }}>{formatTime(ev.event_time)}</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: '#64748B', fontSize: 12 }}>Check-in: <Text style={{ color: '#4ADE80', fontWeight: '700' }}>{checkedIn}/{total}</Text></Text>
                  <Pressable onPress={() => router.push('/(business)/scanner')}>
                    <Text style={{ color: '#A855F7', fontSize: 12, fontWeight: '700' }}>Apri scanner →</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* Quick actions */}
      <View style={{ paddingHorizontal: 20, marginBottom: 40 }}>
        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800', marginBottom: 12 }}>Azioni rapide</Text>
        <View style={{ gap: 10 }}>
          {[
            { label: 'Scannerizza QR', sub: 'Fai check-in all\'ingresso', icon: '📷', path: '/(business)/scanner', color: '#7C3AED' },
            { label: 'Gestisci eventi', sub: 'Attiva, disattiva, crea nuovi', icon: '🎉', path: '/(business)/events', color: '#1D4ED8' },
            { label: 'Vedi prenotazioni', sub: 'Lista completa con filtri', icon: '📋', path: '/(business)/bookings', color: '#065F46' },
          ].map(a => (
            <Pressable key={a.path} onPress={() => router.push(a.path)}
              style={({ pressed }) => ({ backgroundColor: '#111118', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: 'rgba(168,85,247,0.12)', opacity: pressed ? 0.8 : 1 })}
            >
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: a.color + '30', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 22 }}>{a.icon}</Text>
              </View>
              <View>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{a.label}</Text>
                <Text style={{ color: '#64748B', fontSize: 12, marginTop: 2 }}>{a.sub}</Text>
              </View>
              <Text style={{ color: '#A855F7', fontSize: 18, marginLeft: 'auto' }}>›</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
