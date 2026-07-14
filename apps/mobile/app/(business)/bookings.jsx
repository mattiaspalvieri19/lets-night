import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, Alert, TextInput, Modal } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useI18n } from '../../lib/i18n';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY } from '@lets-night/shared';

// Sezione PRENOTAZIONI = centro operativo: nominativi, check-in, tavoli
// prenotati con pagato/residuo. La configurazione dell'evento (tipologie
// ingresso/tavolo) vive nella sezione Eventi.

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
  const name = (booking.snapshot_full_name || booking.profiles?.full_name || '').toLowerCase();
  return name.includes(q);
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
  const [tab, setTab] = useState('entries'); // 'entries' | 'tables'
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
      setTab('entries');
    }
  }, [eventParam]);

  async function loadData() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: v } = await supabase.from('venues').select('id').eq('owner_id', session.user.id).maybeSingle();
    if (!v) { setLoading(false); return; }

    const [{ data: evs }, { data: bks }, { data: tbs }] = await Promise.all([
      supabase.from('events').select('id, title, event_date, event_time').eq('venue_id', v.id).order('event_date', { ascending: false }),
      supabase.from('bookings')
        .select('*, events!inner(id, title, event_date, event_time, venue_id), profiles(full_name, phone, birth_date, gender), event_ticket_types(name, drinks_included)')
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
  const entries = useMemo(
    () => scoped.filter(b => !b.table_id).filter(b => matchesSearch(b, q)),
    [scoped, q]
  );
  const sharesByTable = useMemo(() => {
    const map = {};
    for (const b of bookings) {
      if (!b.table_id) continue;
      (map[b.table_id] = map[b.table_id] || []).push(b);
    }
    return map;
  }, [bookings]);
  const scopedTables = useMemo(() => {
    let list = selectedEvent === 'all' ? tables : tables.filter(tb => tb.event_id === selectedEvent);
    if (q) {
      list = list.filter(tb => {
        const opener = (tb.profiles?.full_name || '').toLowerCase();
        const members = sharesByTable[tb.id] || [];
        return opener.includes(q) || members.some(m => matchesSearch(m, q));
      });
    }
    return list;
  }, [tables, selectedEvent, q, sharesByTable]);

  const stats = useMemo(() => {
    const count = scoped.length;
    const checked = scoped.filter(b => b.checked_in).length;
    const revenue = scoped.reduce((s, b) => s + Number(b.total_price || 0), 0);
    return { count, checked, revenue };
  }, [scoped]);

  if (loading) return <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={COLORS.brand} size="large" /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12 }}>
        <Text style={{ color: COLORS.brand, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>{t('bizBookings.eyebrow')}</Text>
        <Text style={{ fontFamily: FONT_FAMILY.displayHeavy, color: '#fff', fontSize: 24, marginBottom: 12 }}>{t('bizBookings.title')}</Text>

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

        {/* Mini-stats sul filtro corrente */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          {[
            [t('bizBookings.stBookings'), stats.count],
            [t('bizBookings.stEntered'), stats.checked],
            [t('bizBookings.stRevenue'), euro(stats.revenue)],
          ].map(([label, value]) => (
            <View key={label} style={{ flex: 1, backgroundColor: COLORS.bgElev2, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 10 }}>
              <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 15 }} numberOfLines={1}>{value}</Text>
              <Text style={{ color: COLORS.textMuted, fontSize: 10, marginTop: 2 }} numberOfLines={1}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Tab Ingressi | Tavoli */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          {[
            { id: 'entries', label: t('bizBookings.tabEntries') },
            { id: 'tables', label: t('bizBookings.tabTables') },
          ].map(tabDef => {
            const active = tab === tabDef.id;
            return (
              <Pressable key={tabDef.id} onPress={() => setTab(tabDef.id)}
                style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: active ? '#FAFAFA' : COLORS.bgElev2, borderWidth: 1, borderColor: active ? '#FAFAFA' : COLORS.borderSubtle }}
              >
                <Text style={{ color: active ? COLORS.bg : COLORS.textSecondary, fontSize: 13, fontWeight: '700' }}>{tabDef.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Ricerca nominativi */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.bgElev2, borderRadius: 10, paddingHorizontal: 12, marginTop: 10, borderWidth: 1, borderColor: COLORS.borderSubtle }}>
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
        {tab === 'entries' ? (
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
          scopedTables.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 48 }}>
              <Text style={{ color: COLORS.textPrimary, fontSize: 14, fontWeight: '600', marginBottom: 4 }}>{t('bizBookings.noTables')}</Text>
              <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>{t('bizBookings.noTablesSub')}</Text>
            </View>
          ) : scopedTables.map(tb => {
            const covered = tb.status === 'covered';
            const residual = Math.max(0, Number(tb.total_price || 0) - Number(tb.collected || 0));
            return (
              <Pressable
                key={tb.id}
                onPress={() => setTableDetail(tb)}
                style={({ pressed }) => ({ backgroundColor: COLORS.bgElev2, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: COLORS.borderSubtle, opacity: pressed ? 0.85 : 1 })}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={{ color: COLORS.textPrimary, fontWeight: '800', fontSize: 14, flex: 1, marginRight: 8 }} numberOfLines={1}>
                    {tb.event_table_types?.name || t('booking.table')} · {tb.visibility === 'private' ? t('bizEvent.privateL') : t('bizEvent.publicL')}
                  </Text>
                  <View style={{ backgroundColor: covered ? 'rgba(74,222,128,0.12)' : 'rgba(245,158,11,0.12)', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 }}>
                    <Text style={{ color: covered ? COLORS.success : COLORS.warning, fontSize: 11, fontWeight: '700' }}>
                      {covered ? t('bizEvent.covered') : t('bizEvent.collecting')}
                    </Text>
                  </View>
                </View>
                {selectedEvent === 'all' && (
                  <Text style={{ color: COLORS.textMuted, fontSize: 11, marginBottom: 3 }} numberOfLines={1}>{tb.events?.title}</Text>
                )}
                <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>
                  {t('bizBookings.tableBy', { name: tb.profiles?.full_name || t('common.user') })} · {tb.people_count}/{tb.max_people}
                </Text>
                <Text style={{ color: COLORS.textSecondary, fontSize: 12, marginTop: 4 }}>
                  {t('bizBookings.collectedOf', { collected: euro(tb.collected), total: euro(tb.total_price) })}
                </Text>
                <Text style={{ color: residual > 0 ? COLORS.warning : COLORS.success, fontSize: 12, fontWeight: '700', marginTop: 3 }}>
                  {t('bizBookings.residual', { amount: euro(residual) })}
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

// Dettaglio tavolo con partecipanti (componente figlio → proprio useI18n).
function TableDetailModal({ table, members, checkingIn, onCheckIn, onClose }) {
  const { t } = useI18n();
  if (!table) return null;
  const covered = table.status === 'covered';
  const residual = Math.max(0, Number(table.total_price || 0) - Number(table.collected || 0));
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={onClose} />
        <View style={{ backgroundColor: COLORS.bgElev2, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 34, maxHeight: '85%' }}>
          <View style={{ width: 36, height: 4, backgroundColor: COLORS.borderStrong, borderRadius: 2, alignSelf: 'center', marginBottom: 16 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 18, flex: 1, marginRight: 10 }} numberOfLines={1}>
              {table.event_table_types?.name || t('booking.table')}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={24} color={COLORS.textSecondary} />
            </Pressable>
          </View>
          <Text style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>
            {t('bizBookings.tableBy', { name: table.profiles?.full_name || t('common.user') })} · {table.people_count}/{table.max_people} · {covered ? t('bizEvent.covered') : t('bizEvent.collecting')}
          </Text>
          <Text style={{ color: COLORS.textSecondary, fontSize: 13 }}>
            {t('bizBookings.collectedOf', { collected: euro(table.collected), total: euro(table.total_price) })}
          </Text>
          <Text style={{ color: residual > 0 ? COLORS.warning : COLORS.success, fontSize: 13, fontWeight: '700', marginTop: 3, marginBottom: 14 }}>
            {t('bizBookings.residual', { amount: euro(residual) })}
          </Text>

          <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6 }}>
            {t('bizBookings.members', { count: members.length })}
          </Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {members.map(m => {
              const age = calcAge(m.profiles?.birth_date);
              const paid = !!m.stripe_session_id;
              return (
                <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.borderSubtle }}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={{ color: COLORS.textPrimary, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
                      {m.snapshot_full_name || m.profiles?.full_name || t('common.user')}
                    </Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 2 }}>
                      {m.profiles?.gender ? `${GENDER_LABEL[m.profiles.gender]} · ` : ''}
                      {age != null ? t('bizEvent.yearsShort', { age }) + ' · ' : ''}
                      {t('bizEvent.memberMeta', { amount: euro(m.total_price) })}
                      {paid ? ` · ${t('bizBookings.paidApp')}` : ''}
                    </Text>
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
