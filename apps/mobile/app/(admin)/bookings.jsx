import { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, TextInput, Alert, Modal } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { API_URL } from '../../lib/apiUrl';
import { formatDate, COLORS, FONT_FAMILY, tableTotals, activeBookings } from '@lets-night/shared';
import { Ionicons } from '@expo/vector-icons';

// PRENOTAZIONI ADMIN — stessa impostazione della sezione business (panoramica
// con card Ingressi|Tavoli → gestioni) ma su TUTTI i locali: filtro locale →
// filtro evento a cascata, più le azioni admin sui tavoli (sposta partecipante
// tra tavoli dello stesso evento via RPC admin_move_table_member, rimozione =
// nega+rimborsa col flusso esistente). Area admin: italiano.

const GENDER_LABEL = { M: 'M', F: 'F', X: 'X' };
const STATUS_LABELS = { confirmed: 'Confermata', cancelled: 'Annullata', denied: 'Negata/Rimborsata' };
const STATUS_FILTERS = [['all', 'Tutte'], ['confirmed', 'Confermate'], ['checked', 'Entrati'], ['cancelled', 'Annullate'], ['denied', 'Negate']];

const MOVE_ERRORS = {
  ADMIN_ONLY: 'Operazione riservata agli amministratori.',
  BOOKING_NOT_FOUND: 'Prenotazione non trovata.',
  NOT_A_TABLE_MEMBER: 'Questa prenotazione non è una quota tavolo.',
  MEMBER_NOT_ACTIVE: 'La quota è annullata o rimborsata: non si può spostare.',
  SAME_TABLE: 'Il partecipante è già in questo tavolo.',
  DEST_NOT_FOUND: 'Tavolo di destinazione non trovato.',
  DEST_CANCELLED: 'Il tavolo di destinazione è annullato.',
  DIFFERENT_EVENT: 'Si può spostare solo tra tavoli dello stesso evento.',
  DEST_FULL: 'Il tavolo di destinazione è al completo.',
};

function calcAge(birthDate) {
  if (!birthDate) return null;
  const t = new Date(), bd = new Date(birthDate);
  let a = t.getFullYear() - bd.getFullYear();
  const m = t.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < bd.getDate())) a--;
  return a >= 0 && a < 120 ? a : null;
}

function euro(v) { return Number(v || 0).toFixed(2).replace('.', ',').replace(',00', '') + ' €'; }

function matchesSearch(b, q) {
  if (!q) return true;
  const hay = (
    (b.snapshot_full_name || b.profiles?.full_name || '') + ' ' +
    (b.events?.title || '') + ' ' +
    (b.event_ticket_types?.name || '')
  ).toLowerCase();
  return hay.includes(q);
}

export default function AdminBookings() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState('overview'); // 'overview' | 'entries' | 'tables'
  const [venues, setVenues] = useState([]);
  const [venueFilter, setVenueFilter] = useState(null);
  const [venueEvents, setVenueEvents] = useState([]);
  const [eventFilter, setEventFilter] = useState(null);
  const [refundReqs, setRefundReqs] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [tables, setTables] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [busy, setBusy] = useState(null);
  const [tableDetail, setTableDetail] = useState(null);
  const [moveMember, setMoveMember] = useState(null); // booking da spostare

  async function loadData(v = venueFilter, e = eventFilter) {
    let bq = supabase
      .from('bookings')
      .select('*, events!inner(id, title, event_date, venue_id, venues(name)), profiles(full_name, birth_date, gender), event_ticket_types(name, drinks_included)')
      .order('created_at', { ascending: false })
      .limit(1000);
    let tq = supabase
      .from('event_tables')
      .select('*, event_table_types(name), events!inner(id, title, venue_id), profiles(full_name)')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: true })
      .limit(500);
    if (v) { bq = bq.eq('events.venue_id', v); tq = tq.eq('events.venue_id', v); }
    if (e) { bq = bq.eq('event_id', e); tq = tq.eq('event_id', e); }

    const [{ data: rr }, { data: bks, error }, { data: tbs }, { data: vns }] = await Promise.all([
      supabase
        .from('bookings')
        .select('id, total_price, fee, snapshot_full_name, refund_requested_at, refund_request_reason, events(title, event_date)')
        .not('refund_requested_at', 'is', null)
        .not('status', 'in', '("cancelled","denied")')
        .order('refund_requested_at', { ascending: true }),
      bq,
      tq,
      supabase.from('venues').select('id, name').order('name'),
    ]);
    if (error) console.error('Errore prenotazioni admin:', error);
    setRefundReqs(rr || []);
    setBookings(bks || []);
    setTables(tbs || []);
    setVenues(vns || []);
    setLoading(false);
  }

  useFocusEffect(useCallback(() => { loadData(); }, []));
  const onRefresh = useCallback(async () => { setRefreshing(true); await loadData(); setRefreshing(false); }, [venueFilter, eventFilter]);

  async function selectVenue(vid) {
    setVenueFilter(vid);
    setEventFilter(null);
    if (vid) {
      const { data } = await supabase.from('events')
        .select('id, title, event_date')
        .eq('venue_id', vid)
        .order('event_date', { ascending: false })
        .limit(40);
      setVenueEvents(data || []);
    } else {
      setVenueEvents([]);
    }
    loadData(vid, null);
  }

  function selectEvent(eid) {
    setEventFilter(eid);
    loadData(venueFilter, eid);
  }

  function goTo(nextView) {
    setSearch('');
    setExpanded(null);
    setView(nextView);
  }

  // ── Azioni (flussi esistenti, invariati) ──────────────────────────────────
  async function resolveRefund(bookingId, action) {
    const doIt = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setBusy(bookingId);
      try {
        const res = await fetch(`${API_URL}/api/refund/resolve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId, accessToken: session.access_token, action }),
        });
        const json = await res.json();
        if (!res.ok) { Alert.alert('Errore', json.error || 'Operazione non riuscita.'); return; }
        loadData();
      } catch {
        Alert.alert('Errore', 'Connessione al server non riuscita.');
      } finally {
        setBusy(null);
      }
    };
    if (action === 'approve') {
      Alert.alert(
        'Approvare il rimborso?',
        'Verrà rimborsato il prezzo del biglietto al netto delle commissioni; il locale incassa € 0.',
        [{ text: 'Annulla', style: 'cancel' }, { text: 'Approva', onPress: doIt }]
      );
    } else {
      doIt();
    }
  }

  function askCheckIn(b) {
    const name = b.snapshot_full_name || b.profiles?.full_name || 'Utente';
    Alert.alert(
      b.checked_in ? 'Annullare il check-in?' : 'Confermare il check-in?',
      b.checked_in ? `${name} risulterà non entrato.` : `${name} risulterà entrato.`,
      [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Conferma', style: b.checked_in ? 'destructive' : 'default', onPress: () => doToggleCheckIn(b) },
      ]
    );
  }

  async function doToggleCheckIn(b) {
    setBusy(b.id);
    const patch = b.checked_in
      ? { checked_in: false }
      : { checked_in: true, checked_in_at: new Date().toISOString() };
    const { error } = await supabase.from('bookings').update(patch).eq('id', b.id);
    setBusy(null);
    if (error) { Alert.alert('Errore', error.message); return; }
    setBookings(prev => prev.map(x => x.id === b.id ? { ...x, checked_in: !b.checked_in } : x));
  }

  function cancelNoRefund(b) {
    Alert.alert(
      'Annullare senza rimborso?',
      b.table_id
        ? 'È una quota tavolo: il posto torna in raccolta sul tavolo. Il QR verrà invalidato.'
        : 'Il QR verrà invalidato. Nessun rimborso verrà emesso.',
      [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Conferma', style: 'destructive', onPress: async () => {
          setBusy(b.id);
          const { error } = await supabase.from('bookings')
            .update({ status: 'cancelled', qr_code: null })
            .eq('id', b.id);
          setBusy(null);
          if (error) { Alert.alert('Errore', error.message); return; }
          setTableDetail(null);
          loadData();
        } },
      ]
    );
  }

  function denyAndRefund(b) {
    Alert.alert(
      'Negare e rimborsare?',
      b.table_id
        ? 'La quota verrà negata e rimborsata via Stripe: il partecipante esce dal tavolo e i totali si ricalcolano.'
        : 'La prenotazione verrà negata e rimborsata via Stripe.',
      [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Conferma', style: 'destructive', onPress: async () => {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) return;
          setBusy(b.id);
          try {
            const res = await fetch(`${API_URL}/api/stripe/refund-booking`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ bookingId: b.id, accessToken: session.access_token, reason: 'Annullata dall\'amministrazione' }),
            });
            const json = await res.json();
            if (!res.ok) { Alert.alert('Errore', json.error || 'Operazione non riuscita.'); return; }
            setTableDetail(null);
            loadData();
          } catch {
            Alert.alert('Errore', 'Connessione al server non riuscita.');
          } finally {
            setBusy(null);
          }
        } },
      ]
    );
  }

  // ── Spostamento partecipante (RPC admin, stessa-serata) ───────────────────
  function askMove(member, destTable) {
    const name = member.snapshot_full_name || member.profiles?.full_name || 'Utente';
    Alert.alert(
      'Spostare il partecipante?',
      `${name} passerà al tavolo di ${destTable.profiles?.full_name || 'altro utente'} (${destTable.event_table_types?.name || 'Tavolo'}). L'importo pagato (${euro(member.total_price)}) e il QR restano validi; i totali dei due tavoli si ricalcolano.`,
      [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Sposta', onPress: async () => {
          setBusy(member.id);
          const { data, error } = await supabase.rpc('admin_move_table_member', {
            p_booking_id: member.id,
            p_dest_table_id: destTable.id,
          });
          setBusy(null);
          if (error) {
            Alert.alert('Spostamento non riuscito', MOVE_ERRORS[error.message] || error.message);
            return;
          }
          setMoveMember(null);
          setTableDetail(null);
          if (data?.origin_emptied) {
            Alert.alert('Fatto', 'Partecipante spostato. Il tavolo di origine è rimasto vuoto ed è stato annullato.');
          }
          loadData();
        } },
      ]
    );
  }

  // ── Derivati (metriche canoniche) ─────────────────────────────────────────
  const q = search.trim().toLowerCase();
  const activeBk = useMemo(() => activeBookings(bookings), [bookings]);
  const entriesAll = useMemo(() => bookings.filter(b => !b.table_id), [bookings]);
  const entries = useMemo(() => entriesAll.filter(b => {
    if (statusFilter === 'confirmed' && b.status !== 'confirmed') return false;
    if (statusFilter === 'checked' && !b.checked_in) return false;
    if (statusFilter === 'cancelled' && b.status !== 'cancelled') return false;
    if (statusFilter === 'denied' && b.status !== 'denied') return false;
    return matchesSearch(b, q);
  }), [entriesAll, statusFilter, q]);

  const sharesByTable = useMemo(() => {
    const map = {};
    for (const b of activeBk) {
      if (!b.table_id) continue;
      (map[b.table_id] = map[b.table_id] || []).push(b);
    }
    return map;
  }, [activeBk]);

  const filteredTables = useMemo(() => {
    if (!q) return tables;
    return tables.filter(tb => {
      const hay = ((tb.profiles?.full_name || '') + ' ' + (tb.event_table_types?.name || '')).toLowerCase();
      const members = sharesByTable[tb.id] || [];
      return hay.includes(q) || members.some(m => matchesSearch(m, q));
    });
  }, [tables, q, sharesByTable]);

  const entryStats = useMemo(() => {
    const act = activeBk.filter(b => !b.table_id);
    const count = act.length;
    const people = act.reduce((s, b) => s + (Number(b.quantity) || 1), 0);
    const checked = act.filter(b => b.checked_in).length;
    const revenue = act.reduce((s, b) => s + Number(b.total_price || 0), 0);
    return { count, people, checked, toCheck: count - checked, revenue };
  }, [activeBk]);

  const tableStats = useMemo(() => {
    let total = 0, paid = 0, membersCount = 0, toSettle = 0;
    for (const tb of tables) {
      const members = sharesByTable[tb.id] || [];
      const tt = tableTotals(tb, members);
      total += tt.total; paid += tt.paid; membersCount += members.length;
      if (tt.residual > 0.009) toSettle++;
    }
    return { count: tables.length, members: membersCount, total, paid, residual: Math.max(0, total - paid), toSettle };
  }, [tables, sharesByTable]);

  if (loading) return <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={COLORS.brand} size="large" /></View>;

  // Tavoli candidati per lo spostamento: stesso evento, non pieni, diversi dall'origine.
  const moveTargets = moveMember
    ? tables.filter(tb =>
        tb.event_id === moveMember.event_id &&
        tb.id !== moveMember.table_id &&
        (sharesByTable[tb.id] || []).length < tb.max_people)
    : [];

  // ============================ VISTE GESTIONE ============================
  if (view !== 'overview') {
    const isEntries = view === 'entries';
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={() => goTo('overview')} hitSlop={10}>
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </View>
          </Pressable>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ fontFamily: FONT_FAMILY.display, color: '#fff', fontSize: 18 }}>
              {isEntries ? 'Gestione ingressi' : 'Gestione tavoli'}
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
              {venueFilter ? (venues.find(v => v.id === venueFilter)?.name || '') : 'Tutti i locali'}
              {eventFilter ? ` · ${venueEvents.find(e => e.id === eventFilter)?.title || ''}` : ''}
            </Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.bgElev2, borderRadius: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: COLORS.borderSubtle }}>
            <Ionicons name="search" size={15} color={COLORS.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Cerca nome…"
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

        {isEntries && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 40 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 6, paddingBottom: 10 }}>
            {STATUS_FILTERS.map(([fid, label]) => {
              const active = statusFilter === fid;
              return (
                <Pressable key={fid} onPress={() => setStatusFilter(fid)}
                  style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: active ? COLORS.textPrimary : 'transparent', borderWidth: 1, borderColor: active ? COLORS.textPrimary : COLORS.borderSubtle }}>
                  <Text style={{ color: active ? COLORS.bg : COLORS.textSecondary, fontSize: 11, fontWeight: active ? '600' : '500' }}>{label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}>
          {isEntries ? (
            entries.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                <Text style={{ color: COLORS.textPrimary, fontSize: 14, fontWeight: '600' }}>{q ? 'Nessun ingresso trovato' : 'Nessun ingresso'}</Text>
              </View>
            ) : entries.map(b => {
              const isOpen = expanded === b.id;
              const age = calcAge(b.profiles?.birth_date);
              const drinks = Number(b.event_ticket_types?.drinks_included) || 0;
              const paid = !!b.stripe_session_id;
              return (
                <Pressable key={b.id} onPress={() => setExpanded(isOpen ? null : b.id)}
                  style={{ backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: b.checked_in ? 'rgba(74,222,128,0.2)' : COLORS.borderSubtle }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }} numberOfLines={1}>
                        {b.snapshot_full_name || b.profiles?.full_name || 'Utente'}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginTop: 3 }}>
                        {b.profiles?.gender && <Text style={{ color: COLORS.textSecondary, fontSize: 11 }}>{GENDER_LABEL[b.profiles.gender]}</Text>}
                        {age != null && <Text style={{ color: COLORS.textSecondary, fontSize: 11 }}>· {age} anni</Text>}
                        <Text style={{ color: COLORS.textSecondary, fontSize: 11 }}>· {b.quantity || 1} ingressi</Text>
                      </View>
                      <Text style={{ color: COLORS.brand, fontSize: 11, marginTop: 4 }} numberOfLines={1}>
                        {b.event_ticket_types?.name || 'Ingresso standard'}
                        {drinks > 0 ? ` · ${drinks} drink` : ''}
                      </Text>
                      <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 3 }} numberOfLines={1}>
                        {b.events?.title || 'Evento'} · {b.events?.venues?.name || '-'} · {formatDate(b.events?.event_date)}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, alignItems: 'center' }}>
                        <Text style={{ color: COLORS.textSecondary, fontSize: 11 }}>{euro(b.total_price)}</Text>
                        <Text style={{ color: paid ? COLORS.success : COLORS.textSecondary, fontSize: 11 }}>{paid ? 'Pagata in app' : 'Gratuita'}</Text>
                        <Text style={{ color: b.status === 'confirmed' ? COLORS.success : COLORS.danger, fontSize: 11, fontWeight: '600' }}>
                          {STATUS_LABELS[b.status] || b.status}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>{isOpen ? '▲' : '▼'}</Text>
                  </View>
                  {isOpen && b.status === 'confirmed' && (
                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.borderSubtle }}>
                      <Pressable onPress={() => askCheckIn(b)} disabled={busy === b.id}
                        style={{ backgroundColor: COLORS.brandStrong, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
                        {busy === b.id ? <ActivityIndicator size="small" color="#fff" /> : (
                          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>
                            {b.checked_in ? 'Annulla check-in' : 'Check-in'}
                          </Text>
                        )}
                      </Pressable>
                      {b.stripe_session_id && (
                        <Pressable onPress={() => denyAndRefund(b)} disabled={busy === b.id}
                          style={{ backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
                          <Text style={{ color: COLORS.danger, fontSize: 11, fontWeight: '600' }}>Nega + rimborsa</Text>
                        </Pressable>
                      )}
                      <Pressable onPress={() => cancelNoRefund(b)} disabled={busy === b.id}
                        style={{ backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
                        <Text style={{ color: COLORS.danger, fontSize: 11, fontWeight: '600' }}>Annulla senza rimborso</Text>
                      </Pressable>
                    </View>
                  )}
                </Pressable>
              );
            })
          ) : (
            filteredTables.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                <Text style={{ color: COLORS.textPrimary, fontSize: 14, fontWeight: '600' }}>{q ? 'Nessun tavolo trovato' : 'Nessun tavolo prenotato'}</Text>
              </View>
            ) : filteredTables.map(tb => {
              const members = sharesByTable[tb.id] || [];
              const tt = tableTotals(tb, members);
              return (
                <Pressable key={tb.id} onPress={() => setTableDetail(tb)}
                  style={({ pressed }) => ({ backgroundColor: COLORS.bgElev2, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: COLORS.borderSubtle, opacity: pressed ? 0.85 : 1 })}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <Text style={{ color: COLORS.textPrimary, fontWeight: '800', fontSize: 15, flex: 1, marginRight: 8 }} numberOfLines={1}>
                      Tavolo di {tb.profiles?.full_name || 'Utente'}
                    </Text>
                    <View style={{ backgroundColor: tt.residual <= 0 ? 'rgba(74,222,128,0.12)' : 'rgba(245,158,11,0.12)', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 }}>
                      <Text style={{ color: tt.residual <= 0 ? COLORS.success : COLORS.warning, fontSize: 11, fontWeight: '700' }}>
                        {tt.residual <= 0 ? 'Coperto' : 'In raccolta'}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ color: COLORS.textMuted, fontSize: 12 }} numberOfLines={1}>
                    {tb.event_table_types?.name || 'Tavolo'} · {tb.visibility === 'private' ? 'Privato' : 'Pubblico'} · {tb.events?.title || ''}
                  </Text>
                  <Text style={{ color: COLORS.textSecondary, fontSize: 12, marginTop: 6 }}>
                    {members.length}/{tb.max_people} partecipanti · {euro(tt.paid)} su {euro(tt.total)} · residuo <Text style={{ color: tt.residual > 0 ? COLORS.warning : COLORS.success, fontWeight: '700' }}>{euro(tt.residual)}</Text>
                  </Text>
                  <Text style={{ color: COLORS.brand, fontSize: 12, fontWeight: '700', marginTop: 8, textAlign: 'right' }}>Dettagli tavolo →</Text>
                </Pressable>
              );
            })
          )}
        </ScrollView>

        {/* Dettaglio tavolo con azioni admin */}
        {tableDetail && (
          <Modal visible transparent animationType="slide" onRequestClose={() => setTableDetail(null)}>
            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
              <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={() => setTableDetail(null)} />
              <View style={{ backgroundColor: COLORS.bgElev2, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 34, maxHeight: '85%' }}>
                <View style={{ width: 36, height: 4, backgroundColor: COLORS.borderStrong, borderRadius: 2, alignSelf: 'center', marginBottom: 16 }} />
                {(() => {
                  const members = sharesByTable[tableDetail.id] || [];
                  const tt = tableTotals(tableDetail, members);
                  return (
                    <>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 18, flex: 1, marginRight: 10 }} numberOfLines={1}>
                          Tavolo di {tableDetail.profiles?.full_name || 'Utente'}
                        </Text>
                        <Pressable onPress={() => setTableDetail(null)} hitSlop={8}>
                          <Ionicons name="close" size={24} color={COLORS.textSecondary} />
                        </Pressable>
                      </View>
                      <Text style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 10 }} numberOfLines={2}>
                        {tableDetail.event_table_types?.name || 'Tavolo'} · {tableDetail.events?.title || ''}
                      </Text>
                      <View style={{ backgroundColor: COLORS.bgElev3, borderRadius: 12, padding: 12, marginBottom: 14 }}>
                        <Text style={{ color: COLORS.textSecondary, fontSize: 13 }}>
                          {members.length}/{tableDetail.max_people} partecipanti · pagato in app {euro(tt.paid)} su {euro(tt.total)} · residuo <Text style={{ color: tt.residual > 0 ? COLORS.warning : COLORS.success, fontWeight: '700' }}>{euro(tt.residual)}</Text>
                        </Text>
                      </View>
                      <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6 }}>
                        Partecipanti ({members.length})
                      </Text>
                      <ScrollView showsVerticalScrollIndicator={false}>
                        {members.map(m => {
                          const age = calcAge(m.profiles?.birth_date);
                          return (
                            <View key={m.id} style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.borderSubtle }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <View style={{ flex: 1, marginRight: 10 }}>
                                  <Text style={{ color: COLORS.textPrimary, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
                                    {m.snapshot_full_name || m.profiles?.full_name || 'Utente'}
                                  </Text>
                                  <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 2 }}>
                                    {m.profiles?.gender ? `${GENDER_LABEL[m.profiles.gender]} · ` : ''}
                                    {age != null ? `${age} anni · ` : ''}
                                    quota {euro(m.total_price)}{m.stripe_session_id ? ' · Pagata in app' : ''}
                                    {m.checked_in ? ' · Entrato' : ''}
                                  </Text>
                                </View>
                              </View>
                              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                                <Pressable onPress={() => askCheckIn(m)} disabled={busy === m.id}
                                  style={{ backgroundColor: COLORS.brandStrong, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}>
                                  {busy === m.id ? <ActivityIndicator size="small" color="#fff" /> : (
                                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>{m.checked_in ? 'Annulla check-in' : 'Check-in'}</Text>
                                  )}
                                </Pressable>
                                <Pressable onPress={() => setMoveMember(m)} disabled={busy === m.id}
                                  style={{ backgroundColor: COLORS.brandSubtle, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}>
                                  <Text style={{ color: COLORS.brand, fontSize: 11, fontWeight: '700' }}>Sposta</Text>
                                </Pressable>
                                {m.stripe_session_id && (
                                  <Pressable onPress={() => denyAndRefund(m)} disabled={busy === m.id}
                                    style={{ backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}>
                                    <Text style={{ color: COLORS.danger, fontSize: 11, fontWeight: '600' }}>Rimuovi (rimborsa)</Text>
                                  </Pressable>
                                )}
                              </View>
                            </View>
                          );
                        })}
                      </ScrollView>
                    </>
                  );
                })()}
              </View>
            </View>
          </Modal>
        )}

        {/* Selettore tavolo di destinazione */}
        {moveMember && (
          <Modal visible transparent animationType="slide" onRequestClose={() => setMoveMember(null)}>
            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
              <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={() => setMoveMember(null)} />
              <View style={{ backgroundColor: COLORS.bgElev2, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 34, maxHeight: '70%' }}>
                <View style={{ width: 36, height: 4, backgroundColor: COLORS.borderStrong, borderRadius: 2, alignSelf: 'center', marginBottom: 16 }} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 17, flex: 1, marginRight: 10 }}>
                    Sposta in un altro tavolo
                  </Text>
                  <Pressable onPress={() => setMoveMember(null)} hitSlop={8}>
                    <Ionicons name="close" size={24} color={COLORS.textSecondary} />
                  </Pressable>
                </View>
                <Text style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 12 }} numberOfLines={2}>
                  {moveMember.snapshot_full_name || moveMember.profiles?.full_name || 'Utente'} · quota {euro(moveMember.total_price)} · solo tavoli dello stesso evento
                </Text>
                {moveTargets.length === 0 ? (
                  <View style={{ backgroundColor: COLORS.bgElev3, borderRadius: 12, padding: 16 }}>
                    <Text style={{ color: COLORS.textSecondary, fontSize: 13 }}>Nessun altro tavolo disponibile per questo evento.</Text>
                  </View>
                ) : (
                  <ScrollView showsVerticalScrollIndicator={false}>
                    {moveTargets.map(tb => {
                      const members = sharesByTable[tb.id] || [];
                      const tt = tableTotals(tb, members);
                      return (
                        <Pressable key={tb.id} onPress={() => askMove(moveMember, tb)}
                          style={({ pressed }) => ({ backgroundColor: COLORS.bgElev3, borderRadius: 12, padding: 14, marginBottom: 8, opacity: pressed ? 0.8 : 1 })}>
                          <Text style={{ color: COLORS.textPrimary, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>
                            Tavolo di {tb.profiles?.full_name || 'Utente'} · {tb.event_table_types?.name || 'Tavolo'}
                          </Text>
                          <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 3 }}>
                            {members.length}/{tb.max_people} partecipanti · {tb.visibility === 'private' ? 'Privato' : 'Pubblico'} · raccolti {euro(tt.paid)} su {euro(tt.total)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            </View>
          </Modal>
        )}
      </View>
    );
  }

  // ============================== PANORAMICA ==============================
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}>
        <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12 }}>
          <Text style={{ color: COLORS.danger, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', fontWeight: '600', marginBottom: 4 }}>Admin</Text>
          <Text style={{ fontFamily: FONT_FAMILY.display, color: '#fff', fontSize: 22, letterSpacing: -0.3, marginBottom: 12 }}>Prenotazioni</Text>

          {/* Filtro locale */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[[null, 'Tutti i locali'], ...venues.map(v => [v.id, v.name])].map(([vid, label]) => {
                const active = venueFilter === vid;
                return (
                  <Pressable key={vid || 'all'} onPress={() => selectVenue(vid)}
                    style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: active ? COLORS.textPrimary : COLORS.bgElev3, borderWidth: 1, borderColor: active ? COLORS.textPrimary : COLORS.borderSubtle, maxWidth: 220 }}>
                    <Text style={{ color: active ? COLORS.bg : COLORS.textSecondary, fontSize: 12, fontWeight: active ? '700' : '400' }} numberOfLines={1}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {/* Filtro evento (a cascata sul locale) */}
          {venueFilter && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[[null, 'Tutti gli eventi'], ...venueEvents.map(e => [e.id, `${e.title} · ${formatDate(e.event_date)}`])].map(([eid, label]) => {
                  const active = eventFilter === eid;
                  return (
                    <Pressable key={eid || 'all'} onPress={() => selectEvent(eid)}
                      style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: active ? COLORS.textPrimary : COLORS.bgElev3, borderWidth: 1, borderColor: active ? COLORS.textPrimary : COLORS.borderSubtle, maxWidth: 240 }}>
                      <Text style={{ color: active ? COLORS.bg : COLORS.textSecondary, fontSize: 12, fontWeight: active ? '700' : '400' }} numberOfLines={1}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          )}
          {venueFilter && venueEvents.length === 0 && (
            <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 8 }}>Questo locale non ha ancora eventi.</Text>
          )}
        </View>

        {/* Richieste di rimborso (in attesa) */}
        <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
          <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>
            Richieste di rimborso ({refundReqs.length})
          </Text>
          {refundReqs.length === 0 ? (
            <View style={{ backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 14 }}>
              <Text style={{ color: COLORS.textSecondary, fontSize: 13 }}>Nessuna richiesta in attesa.</Text>
            </View>
          ) : refundReqs.map(r => (
            <View key={r.id} style={{ backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 14, marginBottom: 8 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{r.snapshot_full_name || 'Utente'}</Text>
              <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                {r.events?.title || 'Evento'} · {r.events?.event_date || '-'} · rimborso ≈ {euro(r.total_price)}
              </Text>
              {r.refund_request_reason ? (
                <Text style={{ color: COLORS.textSecondary, fontSize: 12, marginTop: 4 }}>Motivo: {r.refund_request_reason}</Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Pressable onPress={() => resolveRefund(r.id, 'approve')} disabled={busy === r.id}
                  style={{ flex: 1, backgroundColor: 'rgba(74,222,128,0.12)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.35)', borderRadius: 8, paddingVertical: 9, alignItems: 'center' }}>
                  {busy === r.id ? <ActivityIndicator size="small" color={COLORS.success} /> : (
                    <Text style={{ color: COLORS.success, fontSize: 12, fontWeight: '700' }}>Approva rimborso</Text>
                  )}
                </Pressable>
                <Pressable onPress={() => resolveRefund(r.id, 'reject')} disabled={busy === r.id}
                  style={{ flex: 1, backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: 8, paddingVertical: 9, alignItems: 'center' }}>
                  <Text style={{ color: COLORS.danger, fontSize: 12, fontWeight: '700' }}>Rifiuta</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>

        {/* CARD INGRESSI */}
        <View style={{ paddingHorizontal: 20, gap: 16 }}>
          <Pressable onPress={() => goTo('entries')}
            style={({ pressed }) => ({ backgroundColor: COLORS.bgElev2, borderRadius: 16, borderWidth: 1, borderColor: COLORS.borderStrong, padding: 14, opacity: pressed ? 0.9 : 1 })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.brandSubtle, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                <Ionicons name="ticket-outline" size={16} color={COLORS.brand} />
              </View>
              <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 17, flex: 1 }}>Ingressi</Text>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <StatBox label="Prenotazioni" value={entryStats.count} />
              <StatBox label="Persone" value={entryStats.people} />
              <StatBox label="Entrati" value={entryStats.checked} valueColor={COLORS.success} />
              <StatBox label="Da fare" value={entryStats.toCheck} valueColor={entryStats.toCheck > 0 ? COLORS.warning : COLORS.success} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: COLORS.borderSubtle }}>
              <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>Incasso app</Text>
              <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 17 }}>{euro(entryStats.revenue)}</Text>
            </View>
            <View style={{ backgroundColor: COLORS.brandStrong, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 10 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Gestisci ingressi</Text>
            </View>
          </Pressable>

          {/* CARD TAVOLI */}
          <Pressable onPress={() => goTo('tables')}
            style={({ pressed }) => ({ backgroundColor: COLORS.bgElev2, borderRadius: 16, borderWidth: 1, borderColor: COLORS.borderStrong, padding: 14, opacity: pressed ? 0.9 : 1 })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.brandSubtle, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                <Ionicons name="wine-outline" size={16} color={COLORS.brand} />
              </View>
              <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 17, flex: 1 }}>Tavoli</Text>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <StatBox label="Tavoli prenotati" value={tableStats.count} />
              <StatBox label="Partecipanti" value={tableStats.members} />
              <StatBox label="Da saldare" value={tableStats.toSettle} valueColor={tableStats.toSettle > 0 ? COLORS.warning : COLORS.success} />
            </View>
            <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: COLORS.borderSubtle }}>
              <TotalRow label="Totale tavoli" value={euro(tableStats.total)} />
              <TotalRow label="Pagati in app" value={euro(tableStats.paid)} valueColor={COLORS.success} />
              <TotalRow label="Residuo" value={euro(tableStats.residual)} valueColor={tableStats.residual > 0 ? COLORS.warning : COLORS.success} />
            </View>
            <View style={{ backgroundColor: COLORS.brandStrong, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 10 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Gestisci tavoli</Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function StatBox({ label, value, valueColor }) {
  return (
    <View style={{ minWidth: '21%', flexGrow: 1, backgroundColor: COLORS.bgElev3, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 10 }}>
      <Text style={{ fontFamily: FONT_FAMILY.display, color: valueColor || COLORS.textPrimary, fontSize: 18, letterSpacing: -0.3 }} numberOfLines={1}>{value}</Text>
      <Text style={{ color: COLORS.textMuted, fontSize: 10, marginTop: 2 }} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function TotalRow({ label, value, valueColor }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
      <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: valueColor || COLORS.textPrimary, fontSize: 13, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}
