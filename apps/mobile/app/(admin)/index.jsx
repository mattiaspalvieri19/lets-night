import { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { COLORS, FONT_FAMILY, isActiveBooking, sumRevenue, categorizeEntries } from '@lets-night/shared';

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
  const [tab, setTab] = useState('active'); // 'active' = eventi in corso/futuri | 'history' = conclusi
  const [venueId, setVenueId] = useState(null);
  const [eventId, setEventId] = useState(null);
  const [raw, setRaw] = useState(null);

  async function loadData() {
    try {
      const since = daysAgoIso(30); // solo per il KPI "nuovi utenti"
      const [
        { data: events },
        { data: bookings },
        { data: venues },
        { count: usersCount },
        newUsersRes,
        { count: pendingVenues },
        { count: pendingRefunds },
        openTicketsRes,
      ] = await Promise.all([
        supabase.from('events').select('id, venue_id, title, event_date, capacity, booked_count, is_active'),
        supabase.from('bookings')
          .select('status, checked_in, refund_reason, total_price, booking_type, created_at, events!inner(id, venue_id, title, event_date)')
,
        supabase.from('venues').select('id, name, is_verified'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        // profiles.created_at potrebbe non esistere: in caso di errore il KPI sparisce.
        supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', since),
        supabase.from('venues').select('id', { count: 'exact', head: true }).eq('is_verified', false),
        supabase.from('bookings').select('id', { count: 'exact', head: true })
          .not('refund_requested_at', 'is', null)
          .not('status', 'in', '("cancelled","denied")'),
        // support_tickets può non esistere finché la migration non è applicata: in errore il badge sparisce.
        supabase.from('support_tickets').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_progress']),
      ]);
      setRaw({
        events: events || [],
        bookings: bookings || [],
        venues: venues || [],
        usersCount: usersCount ?? null,
        newUsers: newUsersRes.error ? null : (newUsersRes.count ?? null),
        pendingVenues: pendingVenues || 0,
        pendingRefunds: pendingRefunds || 0,
        openTickets: openTicketsRes.error ? 0 : (openTicketsRes.count || 0),
      });
    } catch (e) {
      console.error('Errore dashboard admin:', e);
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(useCallback(() => { loadData(); }, []));
  const onRefresh = useCallback(async () => { setRefreshing(true); await loadData(); setRefreshing(false); }, []);

  const d = useMemo(() => {
    if (!raw) return null;
    const today = todayLocal();
    const evs = raw.events.filter(e =>
      (tab === 'history' ? e.event_date < today : e.event_date >= today)
      && (!venueId || e.venue_id === venueId) && (!eventId || e.id === eventId));
    const ids = new Set(evs.map(e => e.id));
    const scoped = raw.bookings.filter(b => ids.has(b.events?.id));
    const bks = scoped.filter(isActiveBooking);

    // Storico: card per-evento
    const pastCards = tab !== 'history' ? [] : evs
      .slice().sort((a, b) => (a.event_date < b.event_date ? 1 : -1))
      .map(e => {
        const list = scoped.filter(b => b.events?.id === e.id);
        const cat = categorizeEntries(list, today);
        return {
          id: e.id, title: e.title, date: e.event_date,
          incasso: sumRevenue(list),
          riempimento: e.capacity ? Math.round(((e.booked_count || 0) / e.capacity) * 100) : null,
          ...cat,
        };
      });

    const attivi = evs.filter(e => e.is_active).length;
    const futuri = evs.filter(e => e.is_active && e.event_date >= today).length;
    const soldout = evs.filter(e => e.capacity && e.booked_count >= e.capacity).length;

    const incasso = sumRevenue(bks);
    const incassoTavoli = sumRevenue(bks.filter(b => b.booking_type === 'table_share'));

    const withCap = evs.filter(e => e.capacity > 0);
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

    return { attivi, futuri, soldout, prenotazioni: bks.length, incasso, incassoTavoli, riempimento, venueRows, topEvents, pastCards };
  }, [raw, venueId, eventId, tab]);

  if (loading || !d) {
    return <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={COLORS.brand} size="large" /></View>;
  }

  const daGestire = raw.pendingVenues + raw.pendingRefunds + raw.openTickets;

  function confirmLogout() {
    Alert.alert("Uscire dall'account?", 'Potrai accedere con un altro account.', [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Esci', style: 'destructive', onPress: async () => {
        await supabase.auth.signOut();
        router.replace('/auth/login');
      } },
    ]);
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: COLORS.bg }} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}>

      <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 18 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Pressable onPress={confirmLogout} hitSlop={8}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: COLORS.bgElev2, borderWidth: 1, borderColor: COLORS.borderSubtle }}>
            <Ionicons name="log-out-outline" size={15} color={COLORS.textSecondary} />
            <Text style={{ color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' }}>Esci</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/(admin)/manage-support')} hitSlop={8}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.bgElev2, borderWidth: 1, borderColor: COLORS.borderSubtle, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="chatbubbles-outline" size={19} color={COLORS.textSecondary} />
            {raw.openTickets > 0 && (
              <View style={{ position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: COLORS.danger, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.bg }}>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{raw.openTickets > 99 ? '99' : raw.openTickets}</Text>
              </View>
            )}
          </Pressable>
        </View>
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
            {raw.openTickets > 0 && (
              <Pressable onPress={() => router.push('/(admin)/manage-support')}>
                <Text style={{ color: COLORS.warning, fontWeight: '600', fontSize: 13 }}>
                  {raw.openTickets} ticket da gestire →
                </Text>
              </Pressable>
            )}
          </View>
        </Section>
      )}

      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 8 }}>
        {[['active', 'In corso'], ['history', 'Storico']].map(([id, label]) => {
          const on = tab === id;
          return (
            <Pressable key={id} onPress={() => { setTab(id); setEventId(null); }}
              style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: on ? COLORS.textPrimary : COLORS.bgElev2, borderWidth: 1, borderColor: on ? COLORS.textPrimary : COLORS.borderSubtle }}>
              <Text style={{ color: on ? COLORS.bg : COLORS.textSecondary, fontSize: 13, fontWeight: '700' }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 6, marginBottom: 8 }}>
        {[[null, 'Tutti i locali'], ...[...raw.venues].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(v => [v.id, v.name])].map(([vid, label]) => {
          const active = venueId === vid;
          return (
            <Pressable key={vid || 'all'} onPress={() => { setVenueId(vid); setEventId(null); }}
              style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, backgroundColor: active ? COLORS.textPrimary : 'transparent', borderWidth: 1, borderColor: active ? COLORS.textPrimary : COLORS.borderSubtle }}>
              <Text style={{ color: active ? COLORS.bg : COLORS.textSecondary, fontSize: 12, fontWeight: active ? '700' : '500' }}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {venueId && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 6, marginBottom: 8 }}>
          {[[null, 'Tutti gli eventi'], ...raw.events
            .filter(e => e.venue_id === venueId)
            .sort((a, b) => (a.event_date < b.event_date ? 1 : -1))
            .map(e => [e.id, e.title])].map(([eid, label]) => {
            const active = eventId === eid;
            return (
              <Pressable key={eid || 'all'} onPress={() => setEventId(eid)}
                style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, backgroundColor: active ? COLORS.textPrimary : 'transparent', borderWidth: 1, borderColor: active ? COLORS.textPrimary : COLORS.borderSubtle }}>
                <Text style={{ color: active ? COLORS.bg : COLORS.textSecondary, fontSize: 12, fontWeight: active ? '700' : '500' }} numberOfLines={1}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, gap: 10, marginTop: 12, marginBottom: 24 }}>
        {[
          { label: 'Incasso', value: euro(d.incasso) },
          { label: 'di cui tavoli', value: euro(d.incassoTavoli) },
          { label: 'Prenotazioni', value: d.prenotazioni },
          { label: 'Riempimento medio', value: d.riempimento != null ? `${d.riempimento}%` : '—' },
          { label: 'Eventi attivi', value: d.attivi },
          { label: 'Eventi futuri', value: d.futuri },
          { label: 'Sold out', value: d.soldout },
          ...(venueId ? [] : [
            { label: 'Utenti totali', value: raw.usersCount ?? '—' },
            ...(raw.newUsers != null ? [{ label: 'Nuovi utenti (30gg)', value: raw.newUsers }] : []),
            { label: 'Locali verificati', value: raw.venues.filter(v => v.is_verified).length },
          ]),
        ].map(s => (
          <View key={s.label} style={{ width: '47%', backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: COLORS.borderSubtle }}>
            <Text style={{ fontFamily: FONT_FAMILY.display, color: '#fff', fontSize: 22, letterSpacing: -0.3, marginBottom: 4 }}>{s.value}</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 11 }}>{s.label}</Text>
          </View>
        ))}
      </View>

      {tab === 'history' && (
        <Section title={`Eventi conclusi (${d.pastCards.length})`}>
          {d.pastCards.length === 0 ? (
            <View style={{ backgroundColor: COLORS.bgElev2, borderRadius: 14, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: COLORS.borderSubtle }}>
              <Text style={{ color: COLORS.textSecondary, fontSize: 13 }}>Nessun evento concluso.</Text>
            </View>
          ) : d.pastCards.map(e => (
            <View key={e.id} style={{ backgroundColor: COLORS.bgElev2, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: COLORS.borderSubtle }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15, flex: 1, marginRight: 10 }} numberOfLines={1}>{e.title}</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>{e.date}</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 }}>
                <View><Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>{e.venduti}</Text><Text style={{ color: COLORS.textMuted, fontSize: 10, marginTop: 2 }}>venduti</Text></View>
                <View><Text style={{ color: COLORS.success, fontSize: 16, fontWeight: '800' }}>{e.entrati}</Text><Text style={{ color: COLORS.textMuted, fontSize: 10, marginTop: 2 }}>entrati</Text></View>
                <View><Text style={{ color: COLORS.danger, fontSize: 16, fontWeight: '800' }}>{e.rifiutati}</Text><Text style={{ color: COLORS.textMuted, fontSize: 10, marginTop: 2 }}>rifiutati</Text></View>
                <View><Text style={{ color: COLORS.warning, fontSize: 16, fontWeight: '800' }}>{e.noShow}</Text><Text style={{ color: COLORS.textMuted, fontSize: 10, marginTop: 2 }}>no-show</Text></View>
                <View><Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>{euro(e.incasso)}</Text><Text style={{ color: COLORS.textMuted, fontSize: 10, marginTop: 2 }}>incasso</Text></View>
                {e.riempimento != null && (
                  <View><Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>{e.riempimento}%</Text><Text style={{ color: COLORS.textMuted, fontSize: 10, marginTop: 2 }}>riempimento</Text></View>
                )}
              </View>
            </View>
          ))}
        </Section>
      )}

      <Section title="Incassi per locale">
        {d.venueRows.length === 0 ? (
          <View style={{ backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 18, alignItems: 'center' }}>
            <Text style={{ color: COLORS.textSecondary, fontSize: 13 }}>Nessuna prenotazione.</Text>
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
