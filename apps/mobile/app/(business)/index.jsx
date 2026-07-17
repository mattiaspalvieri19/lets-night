import { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl, Pressable } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useI18n } from '../../lib/i18n';
import { formatTime, COLORS, FONT_FAMILY, sumRevenue, checkedInCount, categorizeEntries } from '@lets-night/shared';

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

const C = { bg: COLORS.bg, card: COLORS.bgElev2, card2: COLORS.bgElev3, accent: COLORS.brand, accent2: COLORS.brandStrong, white: COLORS.textPrimary, sub: COLORS.textSecondary, muted: COLORS.textMuted, line: COLORS.borderSubtle, green: COLORS.success, danger: COLORS.danger, amber: COLORS.warning, display: FONT_FAMILY.display, heavy: FONT_FAMILY.displayHeavy };

function Section({ title, children }) {
  return (
    <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
      <Text style={{ color: C.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 }}>{title}</Text>
      {children}
    </View>
  );
}

export default function BusinessDashboard() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [venue, setVenue] = useState(null);
  const [raw, setRaw] = useState(null); // dati grezzi: le statistiche si calcolano nel useMemo sotto
  const [selectedEvent, setSelectedEvent] = useState('all');
  const [tab, setTab] = useState('active'); // 'active' = eventi in corso/futuri | 'history' = conclusi

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
        supabase.from('events').select('id, title, event_date, event_time, is_active, capacity, booked_count').eq('venue_id', venueData.id).order('event_date', { ascending: false }),
        // Ingressi: TUTTE le prenotazioni (inclusi denied/cancelled) per categorizzare entrati/rifiutati/no-show
        supabase.from('bookings')
          .select('status, checked_in, refund_reason, events!inner(id, venue_id, event_date)')
          .eq('events.venue_id', venueData.id),
      ]);

      setRaw({ bookings: bookings || [], events: events || [], allBk: allBk || [] });
    } catch (e) {
      console.error('Errore dashboard:', e);
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(useCallback(() => { loadData(); }, []));
  const onRefresh = useCallback(async () => { setRefreshing(true); await loadData(); setRefreshing(false); }, []);

  // Statistiche calcolate sullo scope del filtro evento: 'all' = somma di tutti
  // gli eventi (comportamento storico), altrimenti solo l'evento selezionato.
  // Dashboard = PRESENTE (eventi in corso/futuri, numeri da sempre);
  // Storico = eventi conclusi, con totali aggregati e card per-evento.
  const d = useMemo(() => {
    if (!raw) return null;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const tabEvs = raw.events.filter(e => (tab === 'history' ? e.event_date < todayStr : e.event_date >= todayStr));
    const all = selectedEvent === 'all';
    const evs = all ? tabEvs : tabEvs.filter(e => e.id === selectedEvent);
    const ids = new Set(evs.map(e => e.id));
    const bs = raw.bookings.filter(b => ids.has(b.events?.id));
    const allBk = raw.allBk.filter(b => ids.has(b.events?.id));

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

    // Vendite (metriche canoniche condivise)
    const venditeTotali = sumRevenue(bs);
    const venditeMese = sumRevenue(bs.filter(b => new Date(b.created_at) >= monthStart));
    const venditeTavoli = sumRevenue(bs.filter(b => b.booking_type === 'table_share'));
    const venditeBiglietti = venditeTotali - venditeTavoli;

    // KPI
    const entratiTot = checkedInCount(bs);
    const tassoIngresso = bs.length ? Math.round((entratiTot / bs.length) * 100) : 0;
    const eventiInProgramma = evs.filter(e => e.is_active && e.event_date >= todayStr).length;

    // Pubblico (per cliente unico dello scope). "Ritornano" resta sensato anche
    // filtrando un singolo evento: conta i clienti dello scope che hanno più di
    // una prenotazione considerando TUTTO lo storico del locale.
    const countAllByUser = {};
    for (const b of raw.bookings) { if (b.user_id) countAllByUser[b.user_id] = (countAllByUser[b.user_id] || 0) + 1; }
    const profByUser = {}; const inScope = new Set();
    for (const b of bs) { if (!b.user_id) continue; inScope.add(b.user_id); if (b.profiles) profByUser[b.user_id] = b.profiles; }
    const users = [...inScope];
    const ages = users.map(u => calcAge(profByUser[u]?.birth_date)).filter(a => a != null);
    const etaMedia = ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : null;
    const fasce = { f1: 0, f2: 0, f3: 0 }; // 18-24 / 25-34 / 35+
    for (const a of ages) { if (a < 25) fasce.f1++; else if (a < 35) fasce.f2++; else fasce.f3++; }
    const gen = { u: 0, d: 0, a: 0 };
    for (const u of users) { const g = (profByUser[u]?.gender || '').toUpperCase(); if (g === 'M') gen.u++; else if (g === 'F') gen.d++; else if (g) gen.a++; }
    const ritornano = users.filter(u => countAllByUser[u] > 1).length;
    const pctRitornano = users.length ? Math.round((ritornano / users.length) * 100) : 0;

    // Ingressi conclusi (formula condivisa) — mostrati nello Storico.
    const ingressi = categorizeEntries(allBk, todayStr);

    // Card per-evento dello Storico
    const pastCards = tab !== 'history' ? [] : evs
      .slice()
      .sort((a, b) => (a.event_date < b.event_date ? 1 : -1))
      .map(e => {
        const list = raw.allBk.filter(b => b.events?.id === e.id);
        const act = raw.bookings.filter(b => b.events?.id === e.id);
        const cat = categorizeEntries(list, todayStr);
        return {
          id: e.id, title: e.title, date: e.event_date,
          prenotazioni: act.length, incasso: sumRevenue(act),
          riempimento: e.capacity ? Math.round(((e.booked_count || 0) / e.capacity) * 100) : null,
          ...cat,
        };
      });

    return {
      eventsForChips: tabEvs, pastCards,
      todayEvents,
      venditeTotali, venditeMese, venditeBiglietti, venditeTavoli,
      prenotazioni: bs.length, tassoIngresso, clientiUnici: users.length, eventiInProgramma,
      etaMedia, fasce, gen, pctRitornano, agesCount: ages.length,
      ingressi,
    };
  }, [raw, selectedEvent, tab]);

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={C.accent} size="large" /></View>;
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}>

      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 18 }}>
        <Text style={{ color: C.accent, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>{t('bizDash.eyebrow')}</Text>
        <Text style={{ fontFamily: C.heavy, color: C.white, fontSize: 24 }}>{venue?.name}</Text>
        <Text style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>{[venue?.zona, venue?.city].filter(Boolean).join(', ')}</Text>
        {venue && !venue.is_verified && (
          <View style={{ marginTop: 12, backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', borderRadius: 8, padding: 12 }}>
            <Text style={{ color: C.amber, fontWeight: '600', fontSize: 12 }}>{t('bizDash.pending')}</Text>
            <Text style={{ color: C.sub, fontSize: 11, marginTop: 4, lineHeight: 16 }}>{t('bizDash.pendingSub')}</Text>
          </View>
        )}

        {/* In corso | Storico */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          {[['active', t('bizDash.tabActive')], ['history', t('bizDash.tabHistory')]].map(([id, label]) => {
            const on = tab === id;
            return (
              <Pressable key={id} onPress={() => { setTab(id); setSelectedEvent('all'); }}
                style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: on ? C.white : C.card, borderWidth: 1, borderColor: on ? C.white : C.line }}>
                <Text style={{ color: on ? C.bg : C.sub, fontSize: 13, fontWeight: '700' }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Filtro evento: le statistiche sotto si ricalcolano sullo scope scelto */}
        {(d?.eventsForChips?.length || 0) > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[{ id: 'all', title: t('biz.allEvents') }, ...d.eventsForChips].map(ev => (
                <Pressable key={ev.id} onPress={() => setSelectedEvent(ev.id)}
                  style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: selectedEvent === ev.id ? C.white : C.card2, borderWidth: 1, borderColor: selectedEvent === ev.id ? C.white : C.line, maxWidth: 220 }}
                >
                  <Text style={{ color: selectedEvent === ev.id ? C.bg : C.sub, fontSize: 12, fontWeight: selectedEvent === ev.id ? '700' : '400' }} numberOfLines={1}>
                    {ev.id === 'all' ? t('biz.allEvents') : ev.title}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        )}
      </View>

      {tab === 'active' && (
      <Section title={t('bizDash.tonight')}>
        {d?.todayEvents?.length ? d.todayEvents.map(e => {
          const pct = e.prenotati ? Math.round((e.entrati / e.prenotati) * 100) : 0;
          return (
            <View key={e.id} style={{ backgroundColor: C.card, borderRadius: 16, padding: 18, marginBottom: 10, borderWidth: 1, borderColor: C.line }}>
              <Text style={{ color: C.white, fontWeight: '700', fontSize: 16 }}>{e.title}</Text>
              <Text style={{ color: C.sub, fontSize: 12, marginTop: 2, marginBottom: 14 }}>{formatTime(e.time)}</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View><Text style={{ color: C.white, fontSize: 22, fontWeight: '800' }}>{e.entrati}<Text style={{ color: C.muted, fontSize: 14, fontWeight: '600' }}>/{e.prenotati}</Text></Text><Text style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{t('bizDash.entered')}</Text></View>
                <View><Text style={{ color: C.white, fontSize: 22, fontWeight: '800' }}>{e.tavoli}</Text><Text style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{t('bizDash.tablesLow')}</Text></View>
                <View><Text style={{ color: C.white, fontSize: 22, fontWeight: '800' }}>{euro(e.vendite)}</Text><Text style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{t('bizDash.salesLow')}</Text></View>
              </View>
              <View style={{ height: 6, backgroundColor: C.card2, borderRadius: 3, marginTop: 14, overflow: 'hidden' }}>
                <View style={{ width: `${pct}%`, height: 6, backgroundColor: C.green }} />
              </View>
            </View>
          );
        }) : (
          <View style={{ backgroundColor: C.card, borderRadius: 14, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: C.line }}>
            <Text style={{ color: C.sub, fontSize: 14 }}>{t('bizDash.noEventToday')}</Text>
          </View>
        )}
      </Section>
      )}

      {/* VENDITE */}
      <Section title={t('bizDash.salesSection')}>
        <View style={{ backgroundColor: C.card, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: C.line }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
            <View>
              <Text style={{ fontFamily: C.heavy, color: C.white, fontSize: 30, letterSpacing: -0.6 }}>{euro(d?.venditeTotali)}</Text>
              <Text style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{t('bizDash.totalGenerated')}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: C.white, fontSize: 18, fontWeight: '700' }}>{euro(d?.venditeMese)}</Text>
              <Text style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{t('bizDash.thisMonth')}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
            <View style={{ flex: 1, backgroundColor: C.card2, borderRadius: 10, padding: 12 }}>
              <Text style={{ color: C.sub, fontSize: 11, marginBottom: 4 }}>{t('bizDash.tickets')}</Text>
              <Text style={{ color: C.white, fontSize: 16, fontWeight: '700' }}>{euro(d?.venditeBiglietti)}</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: C.card2, borderRadius: 10, padding: 12 }}>
              <Text style={{ color: C.sub, fontSize: 11, marginBottom: 4 }}>{t('bizDash.tablesCap')}</Text>
              <Text style={{ color: C.white, fontSize: 16, fontWeight: '700' }}>{euro(d?.venditeTavoli)}</Text>
            </View>
          </View>
          <Text style={{ color: C.muted, fontSize: 11, lineHeight: 16 }}>
            {t('bizDash.grossNote')}
          </Text>
        </View>
      </Section>

      {tab === 'history' && (
      <Section title={t('bizDash.entriesSection')}>
        <View style={{ backgroundColor: C.card, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: C.line }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
            <View>
              <Text style={{ fontFamily: C.heavy, color: C.white, fontSize: 30, letterSpacing: -0.6 }}>{d?.ingressi?.venduti ?? 0}</Text>
              <Text style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{t('bizDash.soldConcluded')}</Text>
            </View>
            <Text style={{ color: C.muted, fontSize: 11 }}>{t('bizDash.entriesFormula')}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              { lab: t('bizDash.lEntered'), n: d?.ingressi?.entrati || 0, col: C.green },
              { lab: t('bizDash.lRejected'), n: d?.ingressi?.rifiutati || 0, col: C.danger },
              { lab: t('bizDash.lNoShow'), n: d?.ingressi?.noShow || 0, col: C.amber },
            ].map(s => (
              <View key={s.lab} style={{ flex: 1, backgroundColor: C.card2, borderRadius: 10, padding: 12, alignItems: 'center' }}>
                <Text style={{ fontFamily: C.display, color: s.col, fontSize: 20 }}>{s.n}</Text>
                <Text style={{ color: C.muted, fontSize: 10, marginTop: 3 }}>{s.lab}</Text>
              </View>
            ))}
          </View>
          <Text style={{ color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 12 }}>
            Entrati = QR scansionati e accettati · Rifiutati = ingressi negati · No-show = venduti ma mai scansionati a serata conclusa.
          </Text>
        </View>
      </Section>
      )}

      {tab === 'history' && (
      <Section title={t('bizDash.histTotals')}>
        {d?.pastCards?.length ? d.pastCards.map(e => (
          <View key={e.id} style={{ backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: C.line }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: C.white, fontWeight: '700', fontSize: 15, flex: 1, marginRight: 10 }} numberOfLines={1}>{e.title}</Text>
              <Text style={{ color: C.muted, fontSize: 12 }}>{e.date}</Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 }}>
              <View><Text style={{ color: C.white, fontSize: 16, fontWeight: '800' }}>{e.venduti}</Text><Text style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>{t('bizDash.soldConcluded').split(' ')[0]}</Text></View>
              <View><Text style={{ color: C.green, fontSize: 16, fontWeight: '800' }}>{e.entrati}</Text><Text style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>{t('bizDash.lEntered')}</Text></View>
              <View><Text style={{ color: C.danger, fontSize: 16, fontWeight: '800' }}>{e.rifiutati}</Text><Text style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>{t('bizDash.lRejected')}</Text></View>
              <View><Text style={{ color: C.amber, fontSize: 16, fontWeight: '800' }}>{e.noShow}</Text><Text style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>{t('bizDash.lNoShow')}</Text></View>
              <View><Text style={{ color: C.white, fontSize: 16, fontWeight: '800' }}>{euro(e.incasso)}</Text><Text style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>{t('bizDash.salesLow')}</Text></View>
              {e.riempimento != null && (
                <View><Text style={{ color: C.white, fontSize: 16, fontWeight: '800' }}>{e.riempimento}%</Text><Text style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>{t('bizDash.fill')}</Text></View>
              )}
            </View>
          </View>
        )) : (
          <View style={{ backgroundColor: C.card, borderRadius: 14, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: C.line }}>
            <Text style={{ color: C.sub, fontSize: 14 }}>{t('bizDash.histEmpty')}</Text>
          </View>
        )}
      </Section>
      )}

      {/* KPI */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, gap: 10, marginBottom: 24 }}>
        {[
          { label: t('bizDash.kTotalBookings'), value: d?.prenotazioni ?? 0 },
          { label: t('bizDash.kEntryRate'), value: `${d?.tassoIngresso ?? 0}%` },
          { label: t('bizDash.kUniqueClients'), value: d?.clientiUnici ?? 0 },
          { label: t('bizDash.kUpcoming'), value: d?.eventiInProgramma ?? 0 },
        ].map(s => (
          <View key={s.label} style={{ width: '47%', backgroundColor: C.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.line }}>
            <Text style={{ fontFamily: C.display, color: C.white, fontSize: 24, letterSpacing: -0.3, marginBottom: 4 }}>{s.value}</Text>
            <Text style={{ color: C.muted, fontSize: 11 }}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* PUBBLICO */}
      <Section title={t('bizDash.audience')}>
        {d?.agesCount || d?.clientiUnici ? (
          <View style={{ backgroundColor: C.card, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: C.line }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
              <View><Text style={{ color: C.white, fontSize: 22, fontWeight: '800' }}>{d?.etaMedia ?? '—'}{d?.etaMedia ? ' ' + t('bizDash.years') : ''}</Text><Text style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{t('bizDash.avgAge')}</Text></View>
              <View style={{ alignItems: 'flex-end' }}><Text style={{ color: C.white, fontSize: 22, fontWeight: '800' }}>{d?.pctRitornano ?? 0}%</Text><Text style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{t('bizDash.returning')}</Text></View>
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
              <Text style={{ color: C.sub, fontSize: 12 }}>{t('bizDash.men')} <Text style={{ color: C.white, fontWeight: '700' }}>{d?.gen?.u || 0}</Text></Text>
              <Text style={{ color: C.sub, fontSize: 12 }}>{t('bizDash.women')} <Text style={{ color: C.white, fontWeight: '700' }}>{d?.gen?.d || 0}</Text></Text>
              <Text style={{ color: C.sub, fontSize: 12 }}>{t('bizDash.other')} <Text style={{ color: C.white, fontWeight: '700' }}>{d?.gen?.a || 0}</Text></Text>
            </View>
          </View>
        ) : (
          <View style={{ backgroundColor: C.card, borderRadius: 14, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: C.line }}>
            <Text style={{ color: C.sub, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>{t('bizDash.fewData')}{'\n'}{t('bizDash.fewDataSub')}</Text>
          </View>
        )}
      </Section>

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}
