import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, Alert, TextInput, Modal } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useI18n } from '../../lib/i18n';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY } from '@lets-night/shared';

// Sezione PRENOTAZIONI = centro operativo, in 3 viste:
//   panoramica (card Ingressi | Tavoli con statistiche base)
//     → Gestisci ingressi (ricerca + nominativi + check-in manuale)
//     → Gestisci tavoli (card economiche) → Dettagli tavolo (partecipanti).
// La configurazione dell'evento (tipologie ingresso/tavolo) vive in Eventi.

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

function euro(v) {
  return Number(v || 0).toFixed(2).replace('.', ',').replace(',00', '') + ' €';
}

function matchesSearch(booking, q) {
  if (!q) return true;
  const hay = (
    (booking.snapshot_full_name || booking.profiles?.full_name || '') + ' ' +
    (booking.event_ticket_types?.name || '')
  ).toLowerCase();
  return hay.includes(q);
}

// Totali tavolo COERENTI: sempre calcolati dalla somma dei pagamenti dei
// partecipanti (non dal campo denormalizzato `collected`, che viene solo
// verificato: una discrepanza finisce in console.error, mai nascosta).
function tableTotals(tb, members) {
  const paid = members.reduce((s, m) => s + Number(m.total_price || 0), 0);
  const total = Number(tb.total_price || 0);
  return {
    paid,
    total,
    residual: Math.max(0, total - paid),
    shares: members.filter(m => Number(m.total_price || 0) > 0).length,
  };
}

export default function BusinessBookings() {
  const { t, fmtDate } = useI18n();
  const { event: eventParam } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [events, setEvents] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [tables, setTables] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState('all');
  const [view, setView] = useState('overview'); // 'overview' | 'entries' | 'tables'
  const [search, setSearch] = useState('');
  const [checkingIn, setCheckingIn] = useState(null);
  const [tableDetail, setTableDetail] = useState(null); // event_tables row
  // Il deep-link (?event=ID da "Vedi prenotazioni") si applica UNA volta sola:
  // dopo, comanda solo lo stato locale (il param resta "stale" tra i cambi tab).
  const appliedParam = useRef(null);

  useEffect(() => {
    if (eventParam && appliedParam.current !== eventParam) {
      appliedParam.current = eventParam;
      setSelectedEvent(String(eventParam));
      setView('overview');
      setSearch('');
    }
  }, [eventParam]);

  function goTo(nextView) {
    setSearch('');
    setView(nextView);
  }

  async function loadData() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: v } = await supabase.from('venues').select('id').eq('owner_id', session.user.id).maybeSingle();
    if (!v) { setLoading(false); return; }

    const [{ data: evs }, { data: bks }, { data: tbs }] = await Promise.all([
      supabase.from('events').select('id, title, event_date, event_time').eq('venue_id', v.id).order('event_date', { ascending: false }),
      supabase.from('bookings')
        .select('*, events!inner(id, title, event_date, event_time, venue_id), profiles(full_name, phone, birth_date, gender), event_ticket_types(name, description, drinks_included)')
        .eq('events.venue_id', v.id)
        .not('status', 'in', '("cancelled","denied")')
        .order('created_at', { ascending: false }),
      supabase.from('event_tables')
        .select('*, event_table_types(name), events!inner(id, title, venue_id), profiles(full_name)')
        .eq('events.venue_id', v.id)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: true }),
    ]);
    setEvents(evs || []);
    setBookings(bks || []);
    setTables(tbs || []);
    setLoading(false);
  }

  useFocusEffect(useCallback(() => { loadData(); }, []));
  const onRefresh = useCallback(async () => { setRefreshing(true); await loadData(); setRefreshing(false); }, []);

  // Check-in manuale (fallback dello scanner) e annullo: sempre con conferma.
  function askCheckIn(booking) {
    const name = booking.snapshot_full_name || booking.profiles?.full_name || t('common.user');
    const alreadyIn = !!booking.checked_in;
    Alert.alert(
      alreadyIn ? t('bizBookings.uncheckT') : t('bizBookings.checkinT'),
      alreadyIn ? t('bizBookings.uncheckB', { name }) : t('bizBookings.checkinB', { name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.confirm'), style: alreadyIn ? 'destructive' : 'default', onPress: () => doToggleCheckIn(booking.id, alreadyIn) },
      ]
    );
  }

  async function doToggleCheckIn(bookingId, alreadyIn) {
    setCheckingIn(bookingId);
    // L'un-check NON azzera checked_in_at (audit preservato); il check-in usa il
    // conditional come lo scanner: se un altro device è arrivato prima, no-op.
    const patch = alreadyIn
      ? { checked_in: false }
      : { checked_in: true, checked_in_at: new Date().toISOString() };
    let q = supabase.from('bookings').update(patch).eq('id', bookingId);
    if (!alreadyIn) q = q.eq('checked_in', false);
    const { error } = await q;
    setCheckingIn(null);
    if (error) { Alert.alert(t('common.error'), error.message); return; }
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, checked_in: !alreadyIn } : b));
  }

  // ============================== DERIVATI ==============================
  const q = search.trim().toLowerCase();

  const scoped = useMemo(
    () => (selectedEvent === 'all' ? bookings : bookings.filter(b => b.event_id === selectedEvent)),
    [bookings, selectedEvent]
  );
  const entriesAll = useMemo(() => scoped.filter(b => !b.table_id), [scoped]);
  const entries = useMemo(() => entriesAll.filter(b => matchesSearch(b, q)), [entriesAll, q]);

  const sharesByTable = useMemo(() => {
    const map = {};
    for (const b of bookings) {
      if (!b.table_id) continue;
      (map[b.table_id] = map[b.table_id] || []).push(b);
    }
    return map;
  }, [bookings]);

  const scopedTables = useMemo(
    () => (selectedEvent === 'all' ? tables : tables.filter(tb => tb.event_id === selectedEvent)),
    [tables, selectedEvent]
  );
  // Ricerca tavoli: matcha il "nome" del tavolo (chi l'ha aperto + tipologia)
  // E il nome di QUALSIASI partecipante → restituisce il tavolo di cui fa parte.
  const filteredTables = useMemo(() => {
    if (!q) return scopedTables;
    return scopedTables.filter(tb => {
      const hay = (
        (tb.profiles?.full_name || '') + ' ' +
        (tb.event_table_types?.name || '')
      ).toLowerCase();
      const members = sharesByTable[tb.id] || [];
      return hay.includes(q) || members.some(m => matchesSearch(m, q));
    });
  }, [scopedTables, q, sharesByTable]);

  // Statistiche card INGRESSI (tutte dai dati reali dello scope corrente)
  const entryStats = useMemo(() => {
    const count = entriesAll.length;
    const people = entriesAll.reduce((s, b) => s + (Number(b.quantity) || 1), 0);
    const checked = entriesAll.filter(b => b.checked_in).length;
    const revenue = entriesAll.reduce((s, b) => s + Number(b.total_price || 0), 0);
    const byType = {};
    for (const b of entriesAll) {
      const name = b.event_ticket_types?.name || t('bizBookings.standardType');
      byType[name] = (byType[name] || 0) + (Number(b.quantity) || 1);
    }
    return { count, people, checked, toCheck: count - checked, revenue, byType };
  }, [entriesAll, t]);

  // Statistiche card TAVOLI: pagato = somma pagamenti partecipanti (coerenza §5)
  const tableStats = useMemo(() => {
    let total = 0, paid = 0, membersCount = 0, shares = 0, toSettle = 0;
    for (const tb of scopedTables) {
      const members = sharesByTable[tb.id] || [];
      const tt = tableTotals(tb, members);
      total += tt.total;
      paid += tt.paid;
      shares += tt.shares;
      membersCount += members.length;
      if (tt.residual > 0.009) toSettle++;
    }
    return { count: scopedTables.length, members: membersCount, total, paid, residual: Math.max(0, total - paid), shares, toSettle };
  }, [scopedTables, sharesByTable]);

  // Verifica coerenza collected vs somma pagamenti: discrepanze MAI nascoste.
  useEffect(() => {
    for (const tb of tables) {
      const members = sharesByTable[tb.id] || [];
      const paid = members.reduce((s, m) => s + Number(m.total_price || 0), 0);
      if (Math.abs(paid - Number(tb.collected || 0)) > 0.009) {
        console.error('[TABLE_TOTALS_MISMATCH]', { tableId: tb.id, collected: tb.collected, computedFromMembers: paid });
      }
    }
  }, [tables, sharesByTable]);

  const eventName = selectedEvent === 'all'
    ? t('biz.allEvents')
    : (events.find(e => e.id === selectedEvent)?.title || '');

  if (loading) return <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={COLORS.brand} size="large" /></View>;

  // ============================== VISTE GESTIONE ==============================
  if (view !== 'overview') {
    const isEntries = view === 'entries';
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        {/* Header con back → panoramica */}
        <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={() => goTo('overview')} hitSlop={10}>
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </View>
          </Pressable>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ fontFamily: FONT_FAMILY.display, color: '#fff', fontSize: 18 }}>
              {isEntries ? t('bizBookings.entriesTitle') : t('bizBookings.tablesTitle')}
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>{eventName}</Text>
          </View>
        </View>

        {/* Ricerca nominativi */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.bgElev2, borderRadius: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: COLORS.borderSubtle }}>
            <Ionicons name="search" size={15} color={COLORS.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t('bizBookings.searchPh')}
              placeholderTextColor={COLORS.textDisabled}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ flex: 1, color: COLORS.textPrimary, fontSize: 13, paddingVertical: 9 }}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
              </Pressable>
            )}
          </View>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}>
          {isEntries ? (
            entries.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                <Text style={{ color: COLORS.textPrimary, fontSize: 14, fontWeight: '600', marginBottom: 4 }}>{t('bizBookings.noEntries')}</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>{t('bizBookings.noEntriesSub')}</Text>
              </View>
            ) : entries.map(b => {
              const age = calcAge(b.profiles?.birth_date);
              const paid = !!b.stripe_session_id;
              const drinks = Number(b.event_ticket_types?.drinks_included) || 0;
              return (
                <View key={b.id} style={{ backgroundColor: COLORS.bgElev2, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: b.checked_in ? 'rgba(74,222,128,0.2)' : COLORS.borderSubtle }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text style={{ fontFamily: FONT_FAMILY.display, color: '#fff', fontSize: 14 }} numberOfLines={1}>
                        {b.snapshot_full_name || b.profiles?.full_name || t('common.user')}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginTop: 3 }}>
                        {b.profiles?.gender && <Text style={{ color: COLORS.textSecondary, fontSize: 11 }}>{GENDER_LABEL[b.profiles.gender]}</Text>}
                        {age != null && <Text style={{ color: COLORS.textSecondary, fontSize: 11 }}>· {t('bizEvent.yearsShort', { age })}</Text>}
                        <Text style={{ color: COLORS.textSecondary, fontSize: 11 }}>· {t('bizBookings.qtyEntries', { count: b.quantity || 1 })}</Text>
                      </View>
                      <Text style={{ color: COLORS.brand, fontSize: 11, marginTop: 5 }} numberOfLines={1}>
                        {b.event_ticket_types?.name || t('bizBookings.standardType')}
                        {drinks > 0 ? ` · ${drinks === 1 ? t('booking.drinkOne') : t('booking.drinkMany', { count: drinks })}` : ''}
                      </Text>
                      {b.event_ticket_types?.description ? (
                        <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>{b.event_ticket_types.description}</Text>
                      ) : null}
                      {selectedEvent === 'all' && (
                        <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 3 }} numberOfLines={1}>{b.events?.title}</Text>
                      )}
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                        <View style={{ backgroundColor: paid ? 'rgba(74,222,128,0.12)' : COLORS.bgElev3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}>
                          <Text style={{ color: paid ? COLORS.success : COLORS.textSecondary, fontSize: 10, fontWeight: '700' }}>
                            {paid ? t('bizBookings.paidApp') : t('bizBookings.freeB')}
                          </Text>
                        </View>
                        <Text style={{ color: COLORS.textSecondary, fontSize: 11 }}>{euro(b.total_price)}</Text>
                        <Text style={{ color: COLORS.textDisabled, fontSize: 10 }}>
                          {fmtDate(String(b.created_at).slice(0, 10))} {String(b.created_at).slice(11, 16)}
                        </Text>
                      </View>
                    </View>
                    <Pressable
                      onPress={() => askCheckIn(b)}
                      disabled={checkingIn === b.id}
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
              );
            })
          ) : (
            filteredTables.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                <Text style={{ color: COLORS.textPrimary, fontSize: 14, fontWeight: '600', marginBottom: 4 }}>{t('bizBookings.noTables')}</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>{t('bizBookings.noTablesSub')}</Text>
              </View>
            ) : filteredTables.map(tb => {
              const members = sharesByTable[tb.id] || [];
              const tt = tableTotals(tb, members);
              // NB: non esiste un "nome tavolo" scelto dall'utente nel dato →
              // fallback: chi ha aperto il tavolo + tipologia.
              const openerName = tb.profiles?.full_name || t('common.user');
              return (
                <Pressable
                  key={tb.id}
                  onPress={() => setTableDetail(tb)}
                  style={({ pressed }) => ({ backgroundColor: COLORS.bgElev2, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: COLORS.borderSubtle, opacity: pressed ? 0.85 : 1 })}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <Text style={{ color: COLORS.textPrimary, fontWeight: '800', fontSize: 15, flex: 1, marginRight: 8 }} numberOfLines={1}>
                      {t('bizBookings.tableOf', { name: openerName })}
                    </Text>
                    <View style={{ backgroundColor: tt.residual <= 0 ? 'rgba(74,222,128,0.12)' : 'rgba(245,158,11,0.12)', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 }}>
                      <Text style={{ color: tt.residual <= 0 ? COLORS.success : COLORS.warning, fontSize: 11, fontWeight: '700' }}>
                        {tt.residual <= 0 ? t('bizEvent.covered') : t('bizEvent.collecting')}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ color: COLORS.textMuted, fontSize: 12 }} numberOfLines={1}>
                    {tb.event_table_types?.name || t('booking.table')} · {tb.visibility === 'private' ? t('bizEvent.privateL') : t('bizEvent.publicL')}
                    {selectedEvent === 'all' && tb.events?.title ? ` · ${tb.events.title}` : ''}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
                    <StatInline label={t('bizBookings.stMembers')} value={`${members.length}/${tb.max_people}`} />
                    <StatInline label={t('bizBookings.stTableTotal')} value={euro(tt.total)} />
                    <StatInline label={t('bizBookings.stShares')} value={String(tt.shares)} />
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 }}>
                    <StatInline label={t('bizBookings.stPaidApp')} value={euro(tt.paid)} valueColor={COLORS.success} />
                    <StatInline label={t('bizBookings.stResidual')} value={euro(tt.residual)} valueColor={tt.residual > 0 ? COLORS.warning : COLORS.success} />
                  </View>
                  <Text style={{ color: COLORS.brand, fontSize: 12, fontWeight: '700', marginTop: 10, textAlign: 'right' }}>
                    {t('bizBookings.detailsCta')} →
                  </Text>
                </Pressable>
              );
            })
          )}
        </ScrollView>

        <TableDetailModal
          table={tableDetail}
          members={tableDetail ? (sharesByTable[tableDetail.id] || []) : []}
          checkingIn={checkingIn}
          onCheckIn={askCheckIn}
          onClose={() => setTableDetail(null)}
        />
      </View>
    );
  }

  // ============================== PANORAMICA ==============================
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}>
        <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 18 }}>
          <Text style={{ color: COLORS.brand, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>{t('bizBookings.eyebrow')}</Text>
          <Text style={{ fontFamily: FONT_FAMILY.displayHeavy, color: '#fff', fontSize: 24, marginBottom: 14 }}>{t('bizBookings.title')}</Text>

          {/* Filtro evento */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[{ id: 'all', title: t('biz.allEvents') }, ...events].map(ev => (
                <Pressable key={ev.id} onPress={() => setSelectedEvent(ev.id)}
                  style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: selectedEvent === ev.id ? COLORS.textPrimary : COLORS.bgElev3, borderWidth: 1, borderColor: selectedEvent === ev.id ? COLORS.textPrimary : COLORS.borderSubtle, maxWidth: 220 }}
                >
                  <Text style={{ color: selectedEvent === ev.id ? COLORS.bg : COLORS.textSecondary, fontSize: 12, fontWeight: selectedEvent === ev.id ? '700' : '400' }} numberOfLines={1}>
                    {ev.id === 'all' ? t('biz.allEvents') : ev.title}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* CARD INGRESSI — anatomia identica alla card Tavoli: testata colorata,
            griglia 2×2, riquadro riepilogo, CTA → schermata omogenea. */}
        <View style={{ paddingHorizontal: 20 }}>
          <Pressable
            onPress={() => goTo('entries')}
            style={({ pressed }) => ({ backgroundColor: COLORS.bgElev2, borderRadius: 20, marginBottom: 16, borderWidth: 1, borderColor: COLORS.borderStrong, overflow: 'hidden', opacity: pressed ? 0.9 : 1 })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 15, backgroundColor: 'rgba(168,85,247,0.07)', borderBottomWidth: 1, borderBottomColor: COLORS.borderSubtle }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.brandSubtle, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <Ionicons name="ticket-outline" size={19} color={COLORS.brand} />
              </View>
              <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 20, flex: 1 }}>{t('bizBookings.tabEntries')}</Text>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
            </View>

            <View style={{ padding: 18 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                <StatBox label={t('bizBookings.stBookings')} value={entryStats.count} />
                <StatBox label={t('bizBookings.stPeople')} value={entryStats.people} />
                <StatBox label={t('bizBookings.stEntered')} value={entryStats.checked} valueColor={COLORS.success} />
                <StatBox label={t('bizBookings.stToCheck')} value={entryStats.toCheck} valueColor={entryStats.toCheck > 0 ? COLORS.warning : COLORS.success} />
              </View>

              <View style={{ backgroundColor: COLORS.bgElev3, borderRadius: 12, padding: 14, marginTop: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>{t('bizBookings.stRevenue')}</Text>
                  <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 20 }}>{euro(entryStats.revenue)}</Text>
                </View>
                {Object.keys(entryStats.byType).length > 0 && (
                  <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.borderSubtle }}>
                    {Object.entries(entryStats.byType).map(([name, people]) => (
                      <View key={name} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 }}>
                        <Text style={{ color: COLORS.textMuted, fontSize: 12, flex: 1, marginRight: 8 }} numberOfLines={1}>{name}</Text>
                        <Text style={{ color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' }}>× {people}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <View style={{ backgroundColor: COLORS.brandStrong, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 14 }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{t('bizBookings.manageEntries')}</Text>
              </View>
            </View>
          </Pressable>

          {/* CARD TAVOLI */}
          <Pressable
            onPress={() => goTo('tables')}
            style={({ pressed }) => ({ backgroundColor: COLORS.bgElev2, borderRadius: 20, marginBottom: 16, borderWidth: 1, borderColor: COLORS.borderStrong, overflow: 'hidden', opacity: pressed ? 0.9 : 1 })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 15, backgroundColor: 'rgba(168,85,247,0.07)', borderBottomWidth: 1, borderBottomColor: COLORS.borderSubtle }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.brandSubtle, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <Ionicons name="wine-outline" size={19} color={COLORS.brand} />
              </View>
              <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 20, flex: 1 }}>{t('bizBookings.tabTables')}</Text>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
            </View>

            <View style={{ padding: 18 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                <StatBox label={t('bizBookings.stTables')} value={tableStats.count} />
                <StatBox label={t('bizBookings.stMembers')} value={tableStats.members} />
                <StatBox label={t('bizBookings.stShares')} value={tableStats.shares} valueColor={COLORS.success} />
                <StatBox label={t('bizBookings.stToSettle')} value={tableStats.toSettle} valueColor={tableStats.toSettle > 0 ? COLORS.warning : COLORS.success} />
              </View>

              <View style={{ backgroundColor: COLORS.bgElev3, borderRadius: 12, padding: 14, marginTop: 12 }}>
                <TotalRow label={t('bizBookings.stTableTotal')} value={euro(tableStats.total)} />
                <TotalRow label={t('bizBookings.stPaidApp')} value={euro(tableStats.paid)} valueColor={COLORS.success} />
                <TotalRow label={t('bizBookings.stResidual')} value={euro(tableStats.residual)} valueColor={tableStats.residual > 0 ? COLORS.warning : COLORS.success} />
              </View>

              <View style={{ backgroundColor: COLORS.brandStrong, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 14 }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{t('bizBookings.manageTables')}</Text>
              </View>
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function StatBox({ label, value, valueColor }) {
  return (
    <View style={{ minWidth: '45%', flexGrow: 1, backgroundColor: COLORS.bgElev3, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 14 }}>
      <Text style={{ fontFamily: FONT_FAMILY.display, color: valueColor || COLORS.textPrimary, fontSize: 22, letterSpacing: -0.3 }} numberOfLines={1}>{value}</Text>
      <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 3 }} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function StatInline({ label, value, valueColor }) {
  return (
    <View>
      <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>{label}</Text>
      <Text style={{ color: valueColor || COLORS.textPrimary, fontSize: 13, fontWeight: '700', marginTop: 1 }}>{value}</Text>
    </View>
  );
}

function TotalRow({ label, value, valueColor }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
      <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: valueColor || COLORS.textPrimary, fontSize: 14, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}

// Dettaglio tavolo con partecipanti (componente figlio → proprio useI18n).
// Tutti i totali sono calcolati dalla somma dei pagamenti dei partecipanti.
function TableDetailModal({ table, members, checkingIn, onCheckIn, onClose }) {
  const { t } = useI18n();
  if (!table) return null;
  const paid = members.reduce((s, m) => s + Number(m.total_price || 0), 0);
  const total = Number(table.total_price || 0);
  const residual = Math.max(0, total - paid);
  const shares = members.filter(m => Number(m.total_price || 0) > 0).length;
  // Quota "equa" di riferimento: chi ha pagato di più sta coprendo più quote.
  const fairShare = table.max_people > 0 ? total / table.max_people : 0;
  const openerName = table.profiles?.full_name || t('common.user');
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={onClose} />
        <View style={{ backgroundColor: COLORS.bgElev2, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 34, maxHeight: '85%' }}>
          <View style={{ width: 36, height: 4, backgroundColor: COLORS.borderStrong, borderRadius: 2, alignSelf: 'center', marginBottom: 16 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 18, flex: 1, marginRight: 10 }} numberOfLines={1}>
              {t('bizBookings.tableOf', { name: openerName })}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={24} color={COLORS.textSecondary} />
            </Pressable>
          </View>
          <Text style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 10 }} numberOfLines={2}>
            {table.event_table_types?.name || t('booking.table')} · {table.events?.title || ''}
          </Text>

          <View style={{ backgroundColor: COLORS.bgElev3, borderRadius: 12, padding: 12, marginBottom: 14 }}>
            <TotalRow label={t('bizBookings.stMembers')} value={`${members.length}/${table.max_people}`} />
            <TotalRow label={t('bizBookings.stShares')} value={String(shares)} />
            <TotalRow label={t('bizBookings.stTableTotal')} value={euro(total)} />
            <TotalRow label={t('bizBookings.stPaidApp')} value={euro(paid)} valueColor={COLORS.success} />
            <TotalRow label={t('bizBookings.stResidual')} value={euro(residual)} valueColor={residual > 0 ? COLORS.warning : COLORS.success} />
          </View>

          <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6 }}>
            {t('bizBookings.members', { count: members.length })}
          </Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {members.map(m => {
              const age = calcAge(m.profiles?.birth_date);
              const amount = Number(m.total_price || 0);
              const extra = fairShare > 0 && amount > fairShare + 0.01;
              return (
                <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.borderSubtle }}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={{ color: COLORS.textPrimary, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
                      {m.snapshot_full_name || m.profiles?.full_name || t('common.user')}
                    </Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 2 }}>
                      {m.profiles?.gender ? `${GENDER_LABEL[m.profiles.gender]} · ` : ''}
                      {age != null ? t('bizEvent.yearsShort', { age }) + ' · ' : ''}
                      {t('bizEvent.memberMeta', { amount: euro(amount) })}
                      {amount > 0 ? ` · ${t('bizBookings.paidApp')}` : ''}
                    </Text>
                    {extra && (
                      <View style={{ alignSelf: 'flex-start', backgroundColor: COLORS.brandSubtle, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, marginTop: 3 }}>
                        <Text style={{ color: COLORS.brand, fontSize: 10, fontWeight: '700' }}>{t('bizBookings.extraShare')}</Text>
                      </View>
                    )}
                  </View>
                  <Pressable
                    onPress={() => onCheckIn(m)}
                    disabled={checkingIn === m.id}
                    style={({ pressed }) => ({
                      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
                      backgroundColor: m.checked_in ? 'transparent' : COLORS.brandStrong,
                      borderWidth: 1,
                      borderColor: m.checked_in ? COLORS.borderStrong : COLORS.brandStrong,
                      minWidth: 78, alignItems: 'center',
                      opacity: pressed ? 0.7 : 1,
                    })}>
                    {checkingIn === m.id ? <ActivityIndicator color="#fff" size="small" /> : (
                      <Text style={{ color: m.checked_in ? COLORS.textSecondary : '#fff', fontSize: 11, fontWeight: '600' }}>
                        {m.checked_in ? t('biz.checkedIn') : t('biz.checkIn')}
                      </Text>
                    )}
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
