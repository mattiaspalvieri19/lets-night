import { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, Alert, Modal, TextInput, KeyboardAvoidingView, Platform, Switch } from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { COLORS, FONT_FAMILY, formatDateFull, formatTime } from '@lets-night/shared';
import EventFormModal from '../../../components/EventFormModal';

const EMPTY_TYPE = { name: '', total_price: '', max_people: '8', includes: '', tables_count: '1' };
const EMPTY_TICKET = { name: '', description: '', price: '', drinks_included: '0', quantity: '', is_active: true };

function parseNum(str) {
  const n = parseFloat(String(str).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

function euro(v) {
  return Number(v).toFixed(2).replace('.', ',').replace(',00', '') + ' €';
}

const COMBINE_ERRORS = {
  INSUFFICIENT_FREE_TABLES: 'Una delle tipologie non ha abbastanza tavoli liberi.',
  CANNOT_COMBINE_COMBINED: 'Non si può combinare una tipologia già combinata.',
  NEED_AT_LEAST_TWO_TYPES: 'Servono almeno 2 tipologie.',
};

export default function AdminEventDetailScreen() {
  const { id } = useLocalSearchParams();
  const [event, setEvent] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [tableTypes, setTableTypes] = useState([]);
  const [eventTables, setEventTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingIn, setCheckingIn] = useState(null);
  const [typeModal, setTypeModal] = useState(null);
  const [editModal, setEditModal] = useState(false);
  const [typeForm, setTypeForm] = useState(EMPTY_TYPE);
  const [savingType, setSavingType] = useState(false);
  const [ticketTypes, setTicketTypes] = useState([]);
  const [ticketModal, setTicketModal] = useState(null); // null | {} | { id }
  const [ticketForm, setTicketForm] = useState(EMPTY_TICKET);
  const [combineSel, setCombineSel] = useState([]);
  const [combineCount, setCombineCount] = useState('1');
  const [combineName, setCombineName] = useState('');
  const [combining, setCombining] = useState(false);

  function goBack() {
    if (router.canGoBack()) router.back(); else router.replace('/(admin)');
  }

  async function loadData() {
    const { data: ev } = await supabase
      .from('events')
      .select('*, venues(id, name, zona, city)')
      .eq('id', id)
      .maybeSingle();
    if (!ev) {
      Alert.alert('Evento non trovato', 'L\'evento potrebbe essere stato eliminato.');
      goBack();
      return;
    }
    setEvent(ev);

    const [{ data: bks }, { data: tt }, { data: ts }, { data: tks }] = await Promise.all([
      supabase
        .from('bookings')
        .select('*, profiles(full_name, phone)')
        .eq('event_id', id)
        .not('status', 'in', '("cancelled","denied")')
        .order('created_at', { ascending: false }),
      supabase
        .from('event_table_types')
        .select('*')
        .eq('event_id', id)
        .order('total_price', { ascending: true }),
      supabase
        .from('event_tables')
        .select('*, event_table_types(name)')
        .eq('event_id', id)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: true }),
      supabase
        .from('event_ticket_types')
        .select('*')
        .eq('event_id', id)
        .order('sort_order', { ascending: true })
        .order('price', { ascending: true }),
    ]);
    setBookings(bks || []);
    setTableTypes(tt || []);
    setEventTables(ts || []);
    setTicketTypes(tks || []);
  }

  useFocusEffect(useCallback(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [id]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [id]);

  async function toggleActive() {
    const { error } = await supabase.from('events').update({ is_active: !event.is_active }).eq('id', id);
    if (error) { Alert.alert('Errore', error.message); return; }
    setEvent(prev => ({ ...prev, is_active: !prev.is_active }));
  }

  function deleteEvent() {
    Alert.alert(
      'Eliminare l\'evento?',
      'Operazione definitiva. Possibile solo se l\'evento non ha prenotazioni attive.',
      [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Elimina', style: 'destructive', onPress: async () => {
          const { count, error: countErr } = await supabase
            .from('bookings')
            .select('id', { count: 'exact', head: true })
            .eq('event_id', id)
            .not('status', 'in', '("cancelled","denied")');
          if (countErr) {
            Alert.alert('Errore', 'Impossibile verificare le prenotazioni. Riprova.');
            return;
          }
          if (count && count > 0) {
            Alert.alert('Non eliminabile', 'Questo evento ha prenotazioni attive. Disattivalo (toggle Attivo) invece di eliminarlo.');
            return;
          }
          const { error } = await supabase.from('events').delete().eq('id', id);
          if (error) {
            Alert.alert('Non eliminabile', 'Ci sono dati collegati (tavoli/prenotazioni). Disattiva l\'evento invece di eliminarlo.');
            return;
          }
          goBack();
        } },
      ]
    );
  }

  async function toggleCheckIn(bookingId, alreadyIn) {
    setCheckingIn(bookingId);
    const patch = alreadyIn
      ? { checked_in: false }
      : { checked_in: true, checked_in_at: new Date().toISOString() };
    const { error } = await supabase.from('bookings').update(patch).eq('id', bookingId);
    setCheckingIn(null);
    if (error) { Alert.alert('Errore', error.message); return; }
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, checked_in: !alreadyIn } : b));
  }

  // ====================== TIPOLOGIE DI INGRESSO ======================
  function openTicketModal(tk) {
    if (tk) {
      setTicketForm({
        name: tk.name,
        description: tk.description || '',
        price: String(tk.price),
        drinks_included: String(tk.drinks_included ?? 0),
        quantity: tk.quantity == null ? '' : String(tk.quantity),
        is_active: !!tk.is_active,
      });
      setTicketModal({ id: tk.id });
    } else {
      setTicketForm(EMPTY_TICKET);
      setTicketModal({});
    }
  }

  async function saveTicketType() {
    const price = parseFloat(String(ticketForm.price).replace(',', '.'));
    const drinks = ticketForm.drinks_included === '' ? 0 : parseInt(ticketForm.drinks_included, 10);
    const qty = ticketForm.quantity.trim() === '' ? null : parseInt(ticketForm.quantity, 10);
    if (!ticketForm.name.trim()) { Alert.alert('Manca il nome', 'Es. Base, Premium, Lista.'); return; }
    if (!Number.isFinite(price) || price < 0) { Alert.alert('Prezzo non valido', 'Inserisci il prezzo (0 = gratuita).'); return; }
    if (!Number.isInteger(drinks) || drinks < 0) { Alert.alert('Drink non validi', 'Numero di drink inclusi (0 se nessuno).'); return; }
    if (qty !== null && (!Number.isInteger(qty) || qty < 1)) { Alert.alert('Disponibilità non valida', 'Numero positivo o vuota (illimitata).'); return; }

    setSavingType(true);
    const payload = {
      name: ticketForm.name.trim(),
      description: ticketForm.description.trim() || null,
      price,
      drinks_included: drinks,
      quantity: qty,
      is_active: ticketForm.is_active,
    };
    const { error } = ticketModal?.id
      ? await supabase.from('event_ticket_types').update(payload).eq('id', ticketModal.id)
      : await supabase.from('event_ticket_types').insert({ ...payload, event_id: id });
    setSavingType(false);
    if (error) { Alert.alert('Errore', error.message); return; }
    setTicketModal(null);
    loadData();
  }

  function confirmDeleteTicketType(tk) {
    Alert.alert(
      'Eliminare la tipologia di ingresso?',
      `"${tk.name}" — operazione definitiva.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('event_ticket_types').delete().eq('id', tk.id);
            if (error) {
              Alert.alert(
                'Non eliminabile',
                'Ci sono prenotazioni con questa tipologia. Puoi disattivarla per fermare la vendita.',
                [
                  { text: 'Annulla', style: 'cancel' },
                  { text: 'Disattiva', onPress: async () => {
                    const { error: e2 } = await supabase.from('event_ticket_types').update({ is_active: false }).eq('id', tk.id);
                    if (e2) { Alert.alert('Errore', e2.message); return; }
                    loadData();
                  } },
                ]
              );
              return;
            }
            loadData();
          },
        },
      ]
    );
  }

  // ====================== TIPOLOGIE TAVOLO ======================
  function openTypeModal(type) {
    if (type) {
      setTypeForm({
        name: type.name,
        total_price: String(type.total_price),
        max_people: String(type.max_people),
        includes: type.includes || '',
        tables_count: String(type.tables_count),
      });
      setTypeModal({ id: type.id });
    } else {
      setTypeForm(EMPTY_TYPE);
      setTypeModal({});
    }
  }

  async function saveType() {
    const price = parseNum(typeForm.total_price);
    const maxP = parseInt(typeForm.max_people, 10);
    const count = parseInt(typeForm.tables_count, 10);
    if (!typeForm.name.trim()) { Alert.alert('Manca il nome', 'Es. Standard, Premium, Privé.'); return; }
    if (!Number.isFinite(price) || price <= 0) { Alert.alert('Prezzo non valido', 'Inserisci il prezzo totale del tavolo.'); return; }
    if (!Number.isInteger(maxP) || maxP < 1 || maxP > 30) { Alert.alert('Persone non valide', 'Da 1 a 30.'); return; }
    if (!Number.isInteger(count) || count < 0) { Alert.alert('Disponibilità non valida', 'Quanti tavoli di questo tipo per la serata?'); return; }

    setSavingType(true);
    const payload = {
      name: typeForm.name.trim(),
      total_price: price,
      max_people: maxP,
      includes: typeForm.includes.trim() || null,
      tables_count: count,
    };
    const { error } = typeModal?.id
      ? await supabase.from('event_table_types').update(payload).eq('id', typeModal.id)
      : await supabase.from('event_table_types').insert({ ...payload, event_id: id });
    setSavingType(false);
    if (error) { Alert.alert('Errore', error.message); return; }
    setTypeModal(null);
    loadData();
  }

  function confirmDeleteType(type) {
    Alert.alert(
      'Eliminare la tipologia?',
      `"${type.name}" non sarà più prenotabile.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('event_table_types').delete().eq('id', type.id);
            if (error) {
              Alert.alert('Non eliminabile', 'Ci sono tavoli già prenotati con questa tipologia. Puoi azzerarne la disponibilità modificandola.');
              return;
            }
            loadData();
          },
        },
      ]
    );
  }

  // ====================== TAVOLO COMBINATO ======================
  function toggleCombineSel(typeId) {
    setCombineSel(prev => prev.includes(typeId) ? prev.filter(x => x !== typeId) : [...prev, typeId]);
  }

  async function doCombine() {
    if (combineSel.length < 2) { Alert.alert('Selezione insufficiente', 'Seleziona almeno 2 tipologie da combinare.'); return; }
    const n = parseInt(combineCount, 10);
    if (!Number.isInteger(n) || n < 1) { Alert.alert('Quantità non valida', 'Quanti tavoli combinati vuoi creare?'); return; }
    setCombining(true);
    const { error } = await supabase.rpc('admin_combine_table_types', {
      p_event_id: id,
      p_source_type_ids: combineSel,
      p_tables_count: n,
      p_name: combineName.trim() || null,
    });
    setCombining(false);
    if (error) {
      Alert.alert('Impossibile combinare', COMBINE_ERRORS[error.message] || error.message);
      return;
    }
    const sumPeople = tableTypes.filter(t => combineSel.includes(t.id)).reduce((s, t) => s + t.max_people, 0);
    if (sumPeople > 30) Alert.alert('Nota', 'I posti del tavolo combinato sono stati limitati a 30 (massimo di sistema).');
    setCombineSel([]);
    setCombineCount('1');
    setCombineName('');
    loadData();
  }

  function dissolveType(type) {
    Alert.alert(
      'Sciogliere il combinato?',
      `"${type.name}" verrà eliminato e i tavoli torneranno alle tipologie di origine.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Sciogli', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.rpc('admin_dissolve_combined_type', { p_type_id: type.id });
            if (error) {
              if (error.message === 'TYPE_HAS_TABLES') Alert.alert('Impossibile sciogliere', 'Esistono tavoli aperti su questa tipologia.');
              else Alert.alert('Errore', error.message);
              return;
            }
            loadData();
          },
        },
      ]
    );
  }

  // ============================== DERIVATI ==============================
  const entries = useMemo(() => bookings.filter(b => !b.table_id), [bookings]);
  const sharesByTable = useMemo(() => {
    const map = {};
    for (const b of bookings) {
      if (!b.table_id) continue;
      (map[b.table_id] = map[b.table_id] || []).push(b);
    }
    return map;
  }, [bookings]);

  const stats = useMemo(() => {
    const checkedIn = bookings.filter(b => b.checked_in).length;
    const revenue = bookings
      .filter(b => b.status === 'confirmed')
      .reduce((s, b) => s + parseFloat(b.total_price || 0), 0);
    return { checkedIn, revenue };
  }, [bookings]);

  if (loading || !event) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 60 }}>
          <Pressable onPress={goBack} hitSlop={10}>
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </View>
          </Pressable>
        </View>
        {loading && (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator color={COLORS.brand} size="large" />
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 10, flexDirection: 'row', alignItems: 'center' }}>
        <Pressable onPress={goBack} hitSlop={10}>
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </View>
        </Pressable>
        <Text style={{ flex: 1, fontFamily: FONT_FAMILY.display, color: '#fff', fontSize: 17, marginLeft: 12 }}>Gestione evento</Text>
        <Pressable onPress={() => setEditModal(true)} hitSlop={10}>
          <Ionicons name="create-outline" size={22} color={COLORS.textPrimary} />
        </Pressable>
        <Pressable onPress={deleteEvent} hitSlop={10} style={{ marginLeft: 18 }}>
          <Ionicons name="trash-outline" size={22} color={COLORS.danger} />
        </Pressable>
      </View>
      <ScrollView
        style={{ flex: 1, backgroundColor: COLORS.bg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}
      >
      <View style={{ padding: 20, paddingTop: 16 }}>
        <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>
          {event.category}
        </Text>
        <Text style={{ fontFamily: FONT_FAMILY.displayHeavy, color: COLORS.textPrimary, fontSize: 23, lineHeight: 28, letterSpacing: -0.4 }}>{event.title}</Text>
        <Text style={{ color: COLORS.textSecondary, fontSize: 13, marginTop: 6 }}>
          {formatDateFull(event.event_date)} · {formatTime(event.event_time)}
        </Text>
        <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 4 }}>
          {event.venues?.name} · {event.venues?.zona}, {event.venues?.city}
        </Text>
        <Pressable onPress={toggleActive}
          style={{ alignSelf: 'flex-start', marginTop: 12, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: event.is_active ? 'rgba(74,222,128,0.12)' : 'rgba(100,116,139,0.15)', borderWidth: 1, borderColor: event.is_active ? 'rgba(74,222,128,0.35)' : 'rgba(100,116,139,0.3)' }}>
          <Text style={{ color: event.is_active ? COLORS.success : COLORS.textMuted, fontSize: 12, fontWeight: '700' }}>
            {event.is_active ? 'Attivo (visibile nell\'app)' : 'Disattivato (nascosto)'}
          </Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, gap: 8, marginBottom: 18 }}>
        <StatCard label="Ingressi" value={entries.length} />
        <StatCard label="Tavoli" value={eventTables.length} />
        <StatCard label="Check-in" value={`${stats.checkedIn}/${bookings.length}`} />
        <StatCard label="Incassi" value={`€${stats.revenue.toFixed(0)}`} />
        {event.capacity && (
          <StatCard label="Capienza" value={`${event.booked_count || 0}/${event.capacity}`} />
        )}
      </View>

      {/* ====================== TIPOLOGIE DI INGRESSO ====================== */}
      <View style={{ paddingHorizontal: 20, marginBottom: 22 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 18, letterSpacing: -0.3 }}>Tipologie di ingresso</Text>
          <Pressable
            onPress={() => openTicketModal(null)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.brandStrong, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, opacity: pressed ? 0.85 : 1 })}
          >
            <Ionicons name="add" size={14} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Tipologia</Text>
          </Pressable>
        </View>

        {ticketTypes.length === 0 ? (
          <View style={{ backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 18 }}>
            <Text style={{ color: COLORS.textPrimary, fontWeight: '600', fontSize: 13, marginBottom: 4 }}>Nessuna tipologia di ingresso</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 12, lineHeight: 17 }}>
              Senza tipologie vale il prezzo base dell&apos;evento. Con almeno una attiva, il prezzo in app è il minimo attivo (automatico).
            </Text>
          </View>
        ) : (
          ticketTypes.map(tk => {
            const sold = bookings
              .filter(b => b.ticket_type_id === tk.id)
              .reduce((s, b) => s + (Number(b.quantity) || 1), 0);
            const drinks = Number(tk.drinks_included) || 0;
            return (
              <View key={tk.id} style={{ backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 14, marginBottom: 8, opacity: tk.is_active ? 1 : 0.55 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Text style={{ color: COLORS.textPrimary, fontWeight: '700', fontSize: 14 }}>
                        {tk.name} · {euro(tk.price)}
                      </Text>
                      {!tk.is_active && (
                        <View style={{ backgroundColor: 'rgba(245,158,11,0.12)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}>
                          <Text style={{ color: COLORS.warning, fontSize: 10, fontWeight: '700' }}>Disattivata</Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                      {tk.quantity != null ? `${sold}/${tk.quantity} venduti` : `${sold} venduti · illimitata`}
                      {drinks > 0 ? ` · ${drinks} drink` : ''}
                    </Text>
                    {tk.description ? (
                      <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 3 }} numberOfLines={2}>{tk.description}</Text>
                    ) : null}
                  </View>
                  <Pressable onPress={() => openTicketModal(tk)} hitSlop={8} style={{ padding: 6 }}>
                    <Ionicons name="create-outline" size={17} color={COLORS.textSecondary} />
                  </Pressable>
                  <Pressable onPress={() => confirmDeleteTicketType(tk)} hitSlop={8} style={{ padding: 6 }}>
                    <Ionicons name="trash-outline" size={17} color={COLORS.danger} />
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* ============================ TAVOLI ============================ */}
      <View style={{ paddingHorizontal: 20, marginBottom: 22 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 18, letterSpacing: -0.3 }}>Tavoli</Text>
          <Pressable
            onPress={() => openTypeModal(null)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.brandStrong, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, opacity: pressed ? 0.85 : 1 })}
          >
            <Ionicons name="add" size={14} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Tipologia</Text>
          </Pressable>
        </View>

        {tableTypes.length === 0 ? (
          <View style={{ backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 18 }}>
            <Text style={{ color: COLORS.textPrimary, fontWeight: '600', fontSize: 13, marginBottom: 4 }}>Nessuna tipologia di tavolo</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 12, lineHeight: 17 }}>
              Crea le tipologie per permettere agli utenti di prenotare i tavoli. Seleziona 2+ tipologie per combinarle.
            </Text>
          </View>
        ) : (
          tableTypes.map(t => {
            const used = eventTables.filter(x => x.type_id === t.id).length;
            const isCombined = !!t.combined_from;
            const selected = combineSel.includes(t.id);
            return (
              <View key={t.id} style={{ backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: selected ? 1 : 0, borderColor: COLORS.brandStrong }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {!isCombined && (
                    <Pressable onPress={() => toggleCombineSel(t.id)} hitSlop={8} style={{ marginRight: 10 }}>
                      <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={20} color={selected ? COLORS.brand : COLORS.textMuted} />
                    </Pressable>
                  )}
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ color: COLORS.textPrimary, fontWeight: '700', fontSize: 14 }}>
                        {t.name} · {euro(t.total_price)}
                      </Text>
                      {isCombined && (
                        <View style={{ backgroundColor: 'rgba(239,68,68,0.15)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                          <Text style={{ color: '#f87171', fontSize: 10, fontWeight: '700' }}>Combinato</Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                      max {t.max_people} persone · {used}/{t.tables_count} prenotati
                    </Text>
                    {t.includes ? (
                      <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 3 }} numberOfLines={2}>{t.includes}</Text>
                    ) : null}
                  </View>
                  {isCombined && (
                    <Pressable onPress={() => dissolveType(t)} hitSlop={8} style={{ padding: 6 }}>
                      <Ionicons name="git-branch-outline" size={17} color={COLORS.warning} />
                    </Pressable>
                  )}
                  <Pressable onPress={() => openTypeModal(t)} hitSlop={8} style={{ padding: 6 }}>
                    <Ionicons name="create-outline" size={17} color={COLORS.textSecondary} />
                  </Pressable>
                  <Pressable onPress={() => confirmDeleteType(t)} hitSlop={8} style={{ padding: 6 }}>
                    <Ionicons name="trash-outline" size={17} color={COLORS.danger} />
                  </Pressable>
                </View>
              </View>
            );
          })
        )}

        {combineSel.length >= 2 && (
          <View style={{ backgroundColor: 'rgba(239,68,68,0.05)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)', borderRadius: 12, padding: 14, marginTop: 6 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13, marginBottom: 10 }}>
              Combina {combineSel.length} tipologie (prezzo = somma, posti = somma, max 30)
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              <TextInput
                value={combineCount} onChangeText={setCombineCount}
                placeholder="N. tavoli" placeholderTextColor={COLORS.textDisabled}
                keyboardType="number-pad"
                style={{ width: 90, backgroundColor: COLORS.bgElev3, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#fff', fontSize: 13 }}
              />
              <TextInput
                value={combineName} onChangeText={setCombineName}
                placeholder="Nome (opzionale)" placeholderTextColor={COLORS.textDisabled}
                style={{ flex: 1, backgroundColor: COLORS.bgElev3, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#fff', fontSize: 13 }}
              />
            </View>
            <Pressable onPress={doCombine} disabled={combining}
              style={({ pressed }) => ({ backgroundColor: COLORS.brandStrong, borderRadius: 10, paddingVertical: 11, alignItems: 'center', opacity: combining || pressed ? 0.7 : 1 })}>
              {combining ? <ActivityIndicator color="#fff" size="small" /> : (
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Crea tavolo combinato</Text>
              )}
            </Pressable>
          </View>
        )}

        {/* Tavoli aperti (sola lettura membri + check-in) */}
        {eventTables.map(t => {
          const members = sharesByTable[t.id] || [];
          const covered = t.status === 'covered';
          return (
            <View key={t.id} style={{ backgroundColor: COLORS.bgElev2, borderRadius: 14, padding: 14, marginTop: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Text style={{ color: COLORS.textPrimary, fontWeight: '800', fontSize: 14 }}>
                  {t.event_table_types?.name || 'Tavolo'} · {t.visibility === 'private' ? 'Privato' : 'Pubblico'}
                </Text>
                <View style={{ backgroundColor: covered ? 'rgba(74,222,128,0.12)' : 'rgba(245,158,11,0.12)', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 }}>
                  <Text style={{ color: covered ? COLORS.success : COLORS.warning, fontSize: 11, fontWeight: '700' }}>
                    {covered ? 'Coperto' : 'In raccolta'}
                  </Text>
                </View>
              </View>
              <Text style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 10 }}>
                {t.people_count}/{t.max_people} persone · raccolti {euro(t.collected)} su {euro(t.total_price)}
              </Text>

              {members.map(m => (
                <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.borderSubtle }}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={{ color: COLORS.textPrimary, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
                      {m.snapshot_full_name || m.profiles?.full_name || 'Utente'}
                    </Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 2 }}>
                      quota {euro(m.total_price)}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => toggleCheckIn(m.id, m.checked_in)}
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
                        {m.checked_in ? 'Entrato' : 'Check-in'}
                      </Text>
                    )}
                  </Pressable>
                </View>
              ))}
            </View>
          );
        })}
      </View>

      {/* ============================ INGRESSI ============================ */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 60 }}>
        <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 }}>
          Lista ingressi ({entries.length})
        </Text>

        {entries.length === 0 ? (
          <View style={{ backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 28, alignItems: 'center' }}>
            <Text style={{ color: COLORS.textPrimary, fontSize: 14, fontWeight: '600', marginBottom: 4 }}>
              Nessun ospite
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 12, textAlign: 'center' }}>
              Nessuna prenotazione ingresso per questo evento.
            </Text>
          </View>
        ) : entries.map(b => (
          <View key={b.id} style={{
            backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 14,
            marginBottom: 8,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.textPrimary, fontWeight: '600', fontSize: 14 }} numberOfLines={1}>
                  {b.snapshot_full_name || b.profiles?.full_name || 'Utente'}
                </Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 3 }}>
                  {b.quantity} {b.quantity > 1 ? 'ingressi' : 'ingresso'} · {euro(b.total_price)}
                </Text>
              </View>
              <Pressable
                onPress={() => toggleCheckIn(b.id, b.checked_in)}
                disabled={checkingIn === b.id}
                style={({ pressed }) => ({
                  paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
                  backgroundColor: b.checked_in ? 'transparent' : COLORS.brandStrong,
                  borderWidth: 1,
                  borderColor: b.checked_in ? COLORS.borderStrong : COLORS.brandStrong,
                  minWidth: 78, alignItems: 'center',
                  opacity: pressed ? 0.7 : 1,
                })}>
                {checkingIn === b.id ? <ActivityIndicator color="#fff" size="small" /> : (
                  <Text style={{
                    color: b.checked_in ? COLORS.textSecondary : '#fff',
                    fontSize: 11, fontWeight: '600',
                  }}>
                    {b.checked_in ? 'Entrato' : 'Check-in'}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        ))}
      </View>

      {event && (
        <EventFormModal
          visible={editModal}
          mode="edit"
          event={event}
          onClose={() => setEditModal(false)}
          onSaved={loadData}
        />
      )}

      {/* ================== MODAL TIPOLOGIA DI INGRESSO ================== */}
      <Modal visible={!!ticketModal} transparent animationType="slide" onRequestClose={() => setTicketModal(null)}>
        <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={() => setTicketModal(null)} />
          <View style={{ backgroundColor: COLORS.bgElev2, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 30, maxHeight: '88%' }}>
            <View style={{ width: 36, height: 4, backgroundColor: COLORS.borderStrong, borderRadius: 2, alignSelf: 'center', marginBottom: 16 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <Pressable onPress={saveTicketType} disabled={savingType} hitSlop={8}
                style={({ pressed }) => ({ opacity: savingType || pressed ? 0.5 : 1 })}>
                {savingType ? <ActivityIndicator size="small" color={COLORS.textPrimary} /> : <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 15 }}>{ticketModal?.id ? 'Salva modifiche' : 'Crea tipologia'}</Text>}
              </Pressable>
              <Pressable onPress={() => setTicketModal(null)} hitSlop={8}>
                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
              <TypeField label="Nome" value={ticketForm.name} onChange={v => setTicketForm(f => ({ ...f, name: v }))} placeholder="Es. Base, Premium, Lista" />
              <TypeField label="Descrizione" value={ticketForm.description} onChange={v => setTicketForm(f => ({ ...f, description: v }))} placeholder="Es. Ingresso con 2 drink inclusi entro mezzanotte" multiline />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <TypeField label="Prezzo (€)" value={ticketForm.price} onChange={v => setTicketForm(f => ({ ...f, price: v }))} placeholder="15" keyboardType="decimal-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <TypeField label="Drink inclusi" value={ticketForm.drinks_included} onChange={v => setTicketForm(f => ({ ...f, drinks_included: v }))} placeholder="0" keyboardType="number-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <TypeField label="Disponibilità" value={ticketForm.quantity} onChange={v => setTicketForm(f => ({ ...f, quantity: v }))} placeholder="Vuota = illimitata" keyboardType="number-pad" />
                </View>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingVertical: 4 }}>
                <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase' }}>In vendita</Text>
                <Switch
                  value={ticketForm.is_active}
                  onValueChange={v => setTicketForm(f => ({ ...f, is_active: v }))}
                  trackColor={{ false: COLORS.bgElev3, true: COLORS.brandStrong }}
                  thumbColor="#fff"
                />
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ====================== MODAL TIPOLOGIA ====================== */}
      <Modal visible={!!typeModal} transparent animationType="slide" onRequestClose={() => setTypeModal(null)}>
        <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={() => setTypeModal(null)} />
          <View style={{ backgroundColor: COLORS.bgElev2, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 30, maxHeight: '88%' }}>
            <View style={{ width: 36, height: 4, backgroundColor: COLORS.borderStrong, borderRadius: 2, alignSelf: 'center', marginBottom: 16 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <Pressable onPress={saveType} disabled={savingType} hitSlop={8}
                style={({ pressed }) => ({ opacity: savingType || pressed ? 0.5 : 1 })}>
                {savingType ? <ActivityIndicator size="small" color={COLORS.textPrimary} /> : <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 15 }}>{typeModal?.id ? 'Salva modifiche' : 'Crea tipologia'}</Text>}
              </Pressable>
              <Pressable onPress={() => setTypeModal(null)} hitSlop={8}>
                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
              <TypeField label="Nome" value={typeForm.name} onChange={v => setTypeForm(f => ({ ...f, name: v }))} placeholder="Es. Standard, Premium, Privé" />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <TypeField label="Prezzo totale (€)" value={typeForm.total_price} onChange={v => setTypeForm(f => ({ ...f, total_price: v }))} placeholder="300" keyboardType="decimal-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <TypeField label="Max persone" value={typeForm.max_people} onChange={v => setTypeForm(f => ({ ...f, max_people: v }))} placeholder="8" keyboardType="number-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <TypeField label="Disponibili" value={typeForm.tables_count} onChange={v => setTypeForm(f => ({ ...f, tables_count: v }))} placeholder="1" keyboardType="number-pad" />
                </View>
              </View>
              <TypeField label="Cosa include" value={typeForm.includes} onChange={v => setTypeForm(f => ({ ...f, includes: v }))} placeholder="Es. 3 bottiglie champagne, 2 gin, area riservata..." multiline />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
    </View>
  );
}

function TypeField({ label, value, onChange, placeholder, keyboardType, multiline }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textDisabled}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        style={{
          backgroundColor: COLORS.bgElev3, borderRadius: 12,
          paddingHorizontal: 14, paddingVertical: 12,
          color: COLORS.textPrimary, fontSize: 14,
          minHeight: multiline ? 76 : undefined,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  );
}

function StatCard({ label, value }) {
  return (
    <View style={{
      width: '31.5%', backgroundColor: COLORS.bgElev2,
      borderRadius: 12, padding: 14,
    }}>
      <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 20, letterSpacing: -0.3 }}>{value}</Text>
      <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 4 }}>{label}</Text>
    </View>
  );
}
