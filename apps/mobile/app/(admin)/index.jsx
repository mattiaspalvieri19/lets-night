import { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { COLORS, FONT_FAMILY } from '@lets-night/shared';

const pad = n => String(n).padStart(2, '0');
function todayLocal() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
function daysAgoIso(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}
function euro(v) { return '€ ' + (Number(v) || 0).toFixed(0); }

const PERIODS = [[7, '7 giorni'], [30, '30 giorni'], [90, '90 giorni'], [365, '1 anno']];

function Section({ title, children }) {
  return (
    <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
      <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 }}>{title}</Text>
      {children}
    </View>
  );
}

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [days, setDays] = useState(30);
  const [raw, setRaw] = useState(null);

  async function loadData(period = days) {
    try {
      const since = daysAgoIso(period);
      const [
        { data: events },
        { data: bookings },
        { data: venues },
        { count: usersCount },
        newUsersRes,
        { count: pendingVenues },
        { count: pendingRefunds },
      ] = await Promise.all([
        supabase.from('events').select('id, venue_id, title, event_date, capacity, booked_count, is_active'),
        supabase.from('bookings')
          .select('status, total_price, booking_type, created_at, events!inner(id, venue_id, title, event_date)')
          .gte('created_at', since),
        supabase.from('venues').select('id, name, is_verified'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        // profiles.created_at potrebbe non esistere: in caso di errore il KPI sparisce.
        supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', since),
        supabase.from('venues').select('id', { count: 'exact', head: true }).eq('is_verified', false),
        supabase.from('bookings').select('id', { count: 'exact', head: true })
          .not('refund_requested_at', 'is', null)
          .not('status', 'in', '("cancelled","denied")'),
      ]);
      setRaw({
        events: events || [],
        bookings: bookings || [],
        venues: venues || [],
        usersCount: usersCount ?? null,
        newUsers: newUsersRes.error ? null : (newUsersRes.count ?? null),
        pendingVenues: pendingVenues || 0,
        pendingRefunds: pendingRefunds || 0,
      });
    } catch (e) {
      console.error('Errore dashboard admin:', e);
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(useCallback(() => { loadData(); }, [days]));
  const onRefresh = useCallback(async () => { setRefreshing(true); await loadData(); setRefreshing(false); }, [days]);

  const d = useMemo(() => {
    if (!raw) return null;
    const today = todayLocal();
    const bks = raw.bookings.filter(b => b.status !== 'cancelled' && b.status !== 'denied');

    const attivi = raw.events.filter(e => e.is_active).length;
    const futuri = raw.events.filter(e => e.is_active && e.event_date >= today).length;
    const soldout = raw.events.filter(e => e.capacity && e.booked_count >= e.capacity).length;

    const incasso = bks.reduce((s, b) => s + Number(b.total_price || 0), 0);
    const incassoTavoli = bks.filter(b => b.booking_type === 'table_share').reduce((s, b) => s + Number(b.total_price || 0), 0);

    const withCap = raw.events.filter(e => e.capacity > 0);
    const sumBooked = withCap.reduce((s, e) => s + (e.booked_count || 0), 0);
    const sumCap = withCap.reduce((s, e) => s + e.capacity, 0);
    const riempimento = sumCap ? Math.round((sumBooked / sumCap) * 100) : null;

    const byVenue = {};
    for (const b of bks) {
      const vid = b.events?.venue_id;
      if (!vid) continue;
      byVenue[vid] ||= { count: 0, total: 0 };
      byVenue[vid].count++;
      byVenue[vid].total += Number(b.total_price || 0);
    }
    const venueRows = Object.entries(byVenue)
      .map(([vid, v]) => ({ id: vid, name: raw.venues.find(x => x.id === vid)?.name || 'Locale', ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);

    const byEvent = {};
    for (const b of bks) {
      const eid = b.events?.id;
      if (!eid) continue;
      byEvent[eid] ||= { title: b.events.title, date: b.events.event_date, count: 0, total: 0 };
      byEvent[eid].count++;
      byEvent[eid].total += Number(b.total_price || 0);
    }
    const topEvents = Object.values(byEvent).sort((a, b) => b.total - a.total).slice(0, 5);

    return { attivi, futuri, soldout, prenotazioni: bks.length, incasso, incassoTavoli, riempimento, venueRows, topEvents };
  }, [raw]);

  if (loading || !d) {
    return <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={COLORS.brand} size="large" /></View>;
  }

  const daGestire = raw.pendingVenues + raw.pendingRefunds;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: COLORS.bg }} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}>

      <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 18 }}>
        <Text style={{ color: COLORS.danger, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>Admin</Text>
        <Text style={{ fontFamily: FONT_FAMILY.displayHeavy, color: '#fff', fontSize: 24 }}>Let&apos;s Night</Text>
        <Text style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 2 }}>Panoramica piattaforma</Text>
      </View>

      {daGestire > 0 && (
        <Section title="Da gestire">
          <View style={{ backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', borderRadius: 12, padding: 14, gap: 8 }}>
            {raw.pendingVenues > 0 && (
              <Pressable onPress={() => router.push('/(admin)/venues')}>
                <Text style={{ color: COLORS.warning, fontWeight: '600', fontSize: 13 }}>
                  {raw.pendingVenues} {raw.pendingVenues === 1 ? 'locale in attesa' : 'locali in attesa'} di approvazione →
                </Text>
              </Pressable>
            )}
            {raw.pendingRefunds > 0 && (
              <Pressable onPress={() => router.push('/(admin)/bookings')}>
                <Text style={{ color: COLORS.warning, fontWeight: '600', fontSize: 13 }}>
                  {raw.pendingRefunds} {raw.pendingRefunds === 1 ? 'richiesta di rimborso' : 'richieste di rimborso'} →
                </Text>
              </Pressable>
            )}
          </View>
        </Section>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 6, marginBottom: 20 }}>
        {PERIODS.map(([n, label]) => {
          const active = days === n;
          return (
            <Pressable key={n} onPress={() => { setDays(n); setLoading(true); }}
              style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, backgroundColor: active ? COLORS.textPrimary : 'transparent', borderWidth: 1, borderColor: active ? COLORS.textPrimary : COLORS.borderSubtle }}>
              <Text style={{ color: active ? COLORS.bg : COLORS.textSecondary, fontSize: 12, fontWeight: active ? '700' : '500' }}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, gap: 10, marginBottom: 24 }}>
        {[
          { label: 'Incasso (periodo)', value: euro(d.incasso) },
          { label: 'di cui tavoli', value: euro(d.incassoTavoli) },
          { label: 'Prenotazioni', value: d.prenotazioni },
          { label: 'Riempimento medio', value: d.riempimento != null ? `${d.riempimento}%` : '—' },
          { label: 'Eventi attivi', value: d.attivi },
          { label: 'Eventi futuri', value: d.futuri },
          { label: 'Sold out', value: d.soldout },
          { label: 'Utenti totali', value: raw.usersCount ?? '—' },
          ...(raw.newUsers != null ? [{ label: 'Nuovi utenti (periodo)', value: raw.newUsers }] : []),
          { label: 'Locali verificati', value: raw.venues.filter(v => v.is_verified).length },
        ].map(s => (
          <View key={s.label} style={{ width: '47%', backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: COLORS.borderSubtle }}>
            <Text style={{ fontFamily: FONT_FAMILY.display, color: '#fff', fontSize: 22, letterSpacing: -0.3, marginBottom: 4 }}>{s.value}</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 11 }}>{s.label}</Text>
          </View>
        ))}
      </View>

      <Section title="Incassi per locale (periodo)">
        {d.venueRows.length === 0 ? (
          <View style={{ backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 18, alignItems: 'center' }}>
            <Text style={{ color: COLORS.textSecondary, fontSize: 13 }}>Nessuna prenotazione nel periodo.</Text>
          </View>
        ) : d.venueRows.map(v => (
          <View key={v.id} style={{ backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 14, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }} numberOfLines={1}>{v.name}</Text>
              <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>{v.count} prenotazioni</Text>
            </View>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{euro(v.total)}</Text>
          </View>
        ))}
      </Section>

      <Section title="Top eventi (periodo)">
        {d.topEvents.length === 0 ? (
          <View style={{ backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 18, alignItems: 'center' }}>
            <Text style={{ color: COLORS.textSecondary, fontSize: 13 }}>Nessun dato nel periodo.</Text>
          </View>
        ) : d.topEvents.map((e, i) => (
          <View key={i} style={{ backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 14, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }} numberOfLines={1}>{e.title}</Text>
              <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>{e.date} · {e.count} prenotazioni</Text>
            </View>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{euro(e.total)}</Text>
          </View>
        ))}
      </Section>

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}
