import { useState, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { formatTime } from '@lets-night/shared';

function calcAge(birthDate) {
  if (!birthDate) return null;
  const t = new Date(), b = new Date(birthDate);
  let a = t.getFullYear() - b.getFullYear();
  const m = t.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a--;
  return a >= 0 && a < 120 ? a : null;
}
function euro(v) { return '€ ' + (Number(v) || 0).toFixed(0); }
const pad = n => String(n).padStart(2, '0');

const C = { bg: '#09090f', card: '#111118', card2: '#16161d', accent: '#A855F7', accent2: '#7C3AED', white: '#fff', sub: '#9CA3AF', muted: '#64748B', line: 'rgba(255,255,255,0.06)', green: '#4ADE80' };

function Section({ title, children }) {
  return (
    <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
      <Text style={{ color: C.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 }}>{title}</Text>
      {children}
    </View>
  );
}

export default function BusinessDashboard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [venue, setVenue] = useState(null);
  const [d, setD] = useState(null);

  async function loadData() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/auth/login'); return; }
      const { data: venueData } = await supabase.from('venues').select('*').eq('owner_id', session.user.id).maybeSingle();
      if (!venueData) { setLoading(false); return; }
      setVenue(venueData);

      const [{ data: bookings }, { data: events }, { data: allBk }] = await Promise.all([
        supabase.from('bookings')
          .select('id, status, checked_in, total_price, booking_type, created_at, user_id, events!inner(id, venue_id), profiles(birth_date, gender)')
          .eq('events.venue_id', venueData.id)
          .not('status', 'in', '("cancelled","denied")'),
        supabase.from('events').select('id, title, event_date, event_time, is_active').eq('venue_id', venueData.id),
        // Ingressi: TUTTE le prenotazioni (inclusi denied/cancelled) per categorizzare entrati/rifiutati/no-show
        supabase.from('bookings')
          .select('status, checked_in, refund_reason, events!inner(venue_id, event_date)')
          .eq('events.venue_id', venueData.id),
      ]);

      const bs = bookings || [];
      const evs = events || [];
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      // raggruppa prenotazioni per evento
      const byEvent = {};
      for (const b of bs) { const id = b.events?.id; if (id) (byEvent[id] ||= []).push(b); }

      // Stasera
      const todayEvents = evs.filter(e => e.is_active && e.event_date === todayStr).map(e => {
        const list = byEvent[e.id] || [];
        return {
          id: e.id, title: e.title, time: e.event_time,
          prenotati: list.length,
          entrati: list.filter(b => b.checked_in).length,
          tavoli: list.filter(b => b.booking_type === 'table_share').length,
          vendite: list.reduce((s, b) => s + Number(b.total_price || 0), 0),
        };
      });

      // Vendite
      const venditeTotali = bs.reduce((s, b) => s + Number(b.total_price || 0), 0);
      const venditeMese = bs.filter(b => new Date(b.created_at) >= monthStart).reduce((s, b) => s + Number(b.total_price || 0), 0);
      const venditeTavoli = bs.filter(b => b.booking_type === 'table_share').reduce((s, b) => s + Number(b.total_price || 0), 0);
      const venditeBiglietti = venditeTotali - venditeTavoli;

      // KPI
      const entratiTot = bs.filter(b => b.checked_in).length;
      const tassoIngresso = bs.length ? Math.round((entratiTot / bs.length) * 100) : 0;
      const eventiInProgramma = evs.filter(e => e.is_active && e.event_date >= todayStr).length;

      // Pubblico (per cliente unico)
      const profByUser = {}; const countByUser = {};
      for (const b of bs) { if (!b.user_id) continue; countByUser[b.user_id] = (countByUser[b.user_id] || 0) + 1; if (b.profiles) profByUser[b.user_id] = b.profiles; }
      const users = Object.keys(countByUser);
      const ages = users.map(u => calcAge(profByUser[u]?.birth_date)).filter(a => a != null);
      const etaMedia = ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : null;
      const fasce = { f1: 0, f2: 0, f3: 0 }; // 18-24 / 25-34 / 35+
      for (const a of ages) { if (a < 25) fasce.f1++; else if (a < 35) fasce.f2++; else fasce.f3++; }
      const gen = { u: 0, d: 0, a: 0 };
      for (const u of users) { const g = (profByUser[u]?.gender || '').toUpperCase(); if (g === 'M') gen.u++; else if (g === 'F') gen.d++; else if (g) gen.a++; }
      const ritornano = users.filter(u => countByUser[u] > 1).length;
      const pctRitornano = users.length ? Math.round((ritornano / users.length) * 100) : 0;

      // Ingressi: venduti = entrati + rifiutati + no-show (la somma copre i biglietti degli eventi conclusi).
      // denied = rifiutato (ha checked_in=false), checked_in=true = entrato, altrimenti venduto-non-entrato a
      // serata passata = no-show (inclusi i no-show già rimborsati, riconosciuti dal refund_reason).
      let entrati = 0, rifiutati = 0, noShow = 0;
      for (const b of (allBk || [])) {
        const past = (b.events?.event_date || '') < todayStr;
        if (b.status === 'denied') rifiutati++;
        else if (b.checked_in) entrati++;
        else if (past && (b.status === 'confirmed' || (b.status === 'cancelled' && /^Rimborso no-show/.test(b.refund_reason || '')))) noShow++;
      }
      const ingressi = { venduti: entrati + rifiutati + noShow, entrati, rifiutati, noShow };

      setD({
        todayEvents,
        venditeTotali, venditeMese, venditeBiglietti, venditeTavoli,
        prenotazioni: bs.length, tassoIngresso, clientiUnici: users.length, eventiInProgramma,
        etaMedia, fasce, gen, pctRitornano, agesCount: ages.length,
        ingressi,
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
    return <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={C.accent} size="large" /></View>;
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}>

      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 18 }}>
        <Text style={{ color: C.accent, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>Dashboard</Text>
        <Text style={{ color: C.white, fontSize: 24, fontWeight: '900' }}>{venue?.name}</Text>
        <Text style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>{[venue?.zona, venue?.city].filter(Boolean).join(', ')}</Text>
        {venue && !venue.is_verified && (
          <View style={{ marginTop: 12, backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', borderRadius: 8, padding: 12 }}>
            <Text style={{ color: '#F59E0B', fontWeight: '600', fontSize: 12 }}>In attesa di approvazione</Text>
            <Text style={{ color: C.sub, fontSize: 11, marginTop: 4, lineHeight: 16 }}>Il tuo locale verrà verificato entro 24-48 ore.</Text>
          </View>
        )}
      </View>

      {/* STASERA */}
      <Section title="Stasera">
        {d?.todayEvents?.length ? d.todayEvents.map(e => {
          const pct = e.prenotati ? Math.round((e.entrati / e.prenotati) * 100) : 0;
          return (
            <View key={e.id} style={{ backgroundColor: C.card, borderRadius: 16, padding: 18, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(168,85,247,0.25)' }}>
              <Text style={{ color: C.white, fontWeight: '700', fontSize: 16 }}>{e.title}</Text>
              <Text style={{ color: C.sub, fontSize: 12, marginTop: 2, marginBottom: 14 }}>{formatTime(e.time)}</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View><Text style={{ color: C.white, fontSize: 22, fontWeight: '800' }}>{e.entrati}<Text style={{ color: C.muted, fontSize: 14, fontWeight: '600' }}>/{e.prenotati}</Text></Text><Text style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>entrati</Text></View>
                <View><Text style={{ color: C.white, fontSize: 22, fontWeight: '800' }}>{e.tavoli}</Text><Text style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>tavoli</Text></View>
                <View><Text style={{ color: C.white, fontSize: 22, fontWeight: '800' }}>{euro(e.vendite)}</Text><Text style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>vendite</Text></View>
              </View>
              <View style={{ height: 6, backgroundColor: C.card2, borderRadius: 3, marginTop: 14, overflow: 'hidden' }}>
                <View style={{ width: `${pct}%`, height: 6, backgroundColor: C.green }} />
              </View>
            </View>
          );
        }) : (
          <View style={{ backgroundColor: C.card, borderRadius: 14, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: C.line }}>
            <Text style={{ color: C.sub, fontSize: 14 }}>Nessun evento in programma per oggi</Text>
          </View>
        )}
      </Section>

      {/* VENDITE */}
      <Section title="Vendite via app">
        <View style={{ backgroundColor: C.card, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: C.line }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
            <View>
              <Text style={{ color: C.white, fontSize: 30, fontWeight: '900', letterSpacing: -0.6 }}>{euro(d?.venditeTotali)}</Text>
              <Text style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>totale generato</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: C.white, fontSize: 18, fontWeight: '700' }}>{euro(d?.venditeMese)}</Text>
              <Text style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>questo mese</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
            <View style={{ flex: 1, backgroundColor: C.card2, borderRadius: 10, padding: 12 }}>
              <Text style={{ color: C.sub, fontSize: 11, marginBottom: 4 }}>Biglietti</Text>
              <Text style={{ color: C.white, fontSize: 16, fontWeight: '700' }}>{euro(d?.venditeBiglietti)}</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: C.card2, borderRadius: 10, padding: 12 }}>
              <Text style={{ color: C.sub, fontSize: 11, marginBottom: 4 }}>Tavoli</Text>
              <Text style={{ color: C.white, fontSize: 16, fontWeight: '700' }}>{euro(d?.venditeTavoli)}</Text>
            </View>
          </View>
          <Text style={{ color: C.muted, fontSize: 11, lineHeight: 16 }}>
            È il lordo generato tramite l&apos;app (informativo). L&apos;accredito diretto sul tuo conto arriverà con il collegamento dei pagamenti.
          </Text>
        </View>
      </Section>

      {/* INGRESSI */}
      <Section title="Ingressi">
        <View style={{ backgroundColor: C.card, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: C.line }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
            <View>
              <Text style={{ color: C.white, fontSize: 30, fontWeight: '900', letterSpacing: -0.6 }}>{d?.ingressi?.venduti ?? 0}</Text>
              <Text style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>biglietti venduti (eventi conclusi)</Text>
            </View>
            <Text style={{ color: C.muted, fontSize: 11 }}>entrati + rifiutati + no-show</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              { lab: 'Entrati', n: d?.ingressi?.entrati || 0, col: C.green },
              { lab: 'Rifiutati', n: d?.ingressi?.rifiutati || 0, col: '#F87171' },
              { lab: 'No-show', n: d?.ingressi?.noShow || 0, col: '#FBBF24' },
            ].map(s => (
              <View key={s.lab} style={{ flex: 1, backgroundColor: C.card2, borderRadius: 10, padding: 12, alignItems: 'center' }}>
                <Text style={{ color: s.col, fontSize: 20, fontWeight: '800' }}>{s.n}</Text>
                <Text style={{ color: C.muted, fontSize: 10, marginTop: 3 }}>{s.lab}</Text>
              </View>
            ))}
          </View>
          <Text style={{ color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 12 }}>
            Entrati = QR scansionati e accettati · Rifiutati = ingressi negati · No-show = venduti ma mai scansionati a serata conclusa.
          </Text>
        </View>
      </Section>

      {/* KPI */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, gap: 10, marginBottom: 24 }}>
        {[
          { label: 'Prenotazioni totali', value: d?.prenotazioni ?? 0 },
          { label: 'Tasso d\'ingresso', value: `${d?.tassoIngresso ?? 0}%` },
          { label: 'Clienti unici', value: d?.clientiUnici ?? 0 },
          { label: 'Eventi in programma', value: d?.eventiInProgramma ?? 0 },
        ].map(s => (
          <View key={s.label} style={{ width: '47%', backgroundColor: C.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.line }}>
            <Text style={{ color: C.white, fontSize: 24, fontWeight: '800', letterSpacing: -0.3, marginBottom: 4 }}>{s.value}</Text>
            <Text style={{ color: C.muted, fontSize: 11 }}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* PUBBLICO */}
      <Section title="Il tuo pubblico">
        {d?.agesCount || d?.clientiUnici ? (
          <View style={{ backgroundColor: C.card, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: C.line }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
              <View><Text style={{ color: C.white, fontSize: 22, fontWeight: '800' }}>{d?.etaMedia ?? '—'}{d?.etaMedia ? ' anni' : ''}</Text><Text style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>età media</Text></View>
              <View style={{ alignItems: 'flex-end' }}><Text style={{ color: C.white, fontSize: 22, fontWeight: '800' }}>{d?.pctRitornano ?? 0}%</Text><Text style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>clienti che tornano</Text></View>
            </View>
            {/* Fasce d'età */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              {[['18-24', d?.fasce?.f1 || 0], ['25-34', d?.fasce?.f2 || 0], ['35+', d?.fasce?.f3 || 0]].map(([lab, n]) => (
                <View key={lab} style={{ flex: 1, backgroundColor: C.card2, borderRadius: 10, padding: 10, alignItems: 'center' }}>
                  <Text style={{ color: C.white, fontSize: 16, fontWeight: '700' }}>{n}</Text>
                  <Text style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>{lab}</Text>
                </View>
              ))}
            </View>
            {/* Genere */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: C.sub, fontSize: 12 }}>Uomini <Text style={{ color: C.white, fontWeight: '700' }}>{d?.gen?.u || 0}</Text></Text>
              <Text style={{ color: C.sub, fontSize: 12 }}>Donne <Text style={{ color: C.white, fontWeight: '700' }}>{d?.gen?.d || 0}</Text></Text>
              <Text style={{ color: C.sub, fontSize: 12 }}>Altro <Text style={{ color: C.white, fontWeight: '700' }}>{d?.gen?.a || 0}</Text></Text>
            </View>
          </View>
        ) : (
          <View style={{ backgroundColor: C.card, borderRadius: 14, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: C.line }}>
            <Text style={{ color: C.sub, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>Ancora pochi dati.{'\n'}Le statistiche sul pubblico compaiono con le prime prenotazioni.</Text>
          </View>
        )}
      </Section>

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}
