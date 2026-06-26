import { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, Alert, Modal, TextInput, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { COLORS, FONT_FAMILY, formatDateFull, formatTime } from '@lets-night/shared';
import EventFormModal from '../../components/EventFormModal';

const FILTERS = [
  { id: 'all',     label: 'Tutti' },
  { id: 'checked', label: 'Entrati' },
  { id: 'pending', label: 'Da entrare' },
];

const GENDER_LABEL = { M: 'M', F: 'F', X: 'X' };

const EMPTY_TYPE = { name: '', total_price: '', max_people: '8', includes: '', tables_count: '1' };

function calcAge(birthDate) {
  if (!birthDate) return null;
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age < 0 ? null : age;
}

function parseNum(str) {
  const n = parseFloat(String(str).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

function euro(v) {
  return Number(v).toFixed(2).replace('.', ',').replace(',00', '') + ' €';
}

export default function BusinessEventDetailScreen() {
  const { id } = useLocalSearchParams();
  const [event, setEvent] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [tableTypes, setTableTypes] = useState([]);
  const [eventTables, setEventTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [checkingIn, setCheckingIn] = useState(null);
  const [typeModal, setTypeModal] = useState(null); // null | {} (nuova) | { id } (modifica)
  const [editModal, setEditModal] = useState(false);
  const [typeForm, setTypeForm] = useState(EMPTY_TYPE);
  const [savingType, setSavingType] = useState(false);


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
            Alert.alert('Non eliminabile', 'Questo evento ha prenotazioni attive. Nascondilo dalla lista eventi (toggle Attivo) invece di eliminarlo.');
            return;
          }
          const { error } = await supabase.from('events').delete().eq('id', id);
          if (error) {
            Alert.alert('Non eliminabile', 'Ci sono dati collegati (tavoli/prenotazioni). Nascondi l\'evento invece di eliminarlo.');
            return;
          }
          if (router.canGoBack()) router.back(); else router.replace('/(business)');
        } },
      ]
    );
  }

  async function loadData() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace('/auth/login'); return; }

    // Verifica ownership: l'evento deve appartenere a un venue dell'utente
    const { data: ev } = await supabase
      .from('events')
      .select('*, venues!inner(id, name, zona, city, owner_id)')
      .eq('id', id)
      .maybeSingle();

    if (!ev || ev.venues.owner_id !== session.user.id) {
      Alert.alert('Accesso negato', 'Questo evento non appartiene al tuo locale.');
      router.back();
      return;
    }
    setEvent(ev);

    const [{ data: bks }, { data: tt }, { data: ts }] = await Promise.all([
      supabase
        .from('bookings')
        .select('*, profiles(full_name, phone, birth_date, gender)')
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
    ]);
    setBookings(bks || []);
    setTableTypes(tt || []);
    setEventTables(ts || []);
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

  async function toggleCheckIn(bookingId, alreadyIn) {
    setCheckingIn(bookingId);
    // L'un-check NON azzera checked_in_at: preserva l'audit trail (parità col web).
    const patch = alreadyIn
      ? { checked_in: false }
      : { checked_in: true, checked_in_at: new Date().toISOString() };
    const { error } = await supabase.from('bookings').update(patch).eq('id', bookingId);
    setCheckingIn(null);
    if (error) { Alert.alert('Errore', error.message); return; }
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, checked_in: !alreadyIn } : b));
  }

  // ====================== TIPOLOGIE TAVOLO (CRUD locale) ======================
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
    if (!Number.isInteger(count) || count < 0) { Alert.alert('Disponibilità non valida', 'Quanti tavoli di questo tipo hai per la serata?'); return; }

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
              // FK restrict: esistono tavoli già aperti su questa tipologia.
              Alert.alert('Non eliminabile', 'Ci sono tavoli già prenotati con questa tipologia. Puoi azzerarne la disponibilità modificandola.');
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

  const filtered = useMemo(() => {
    if (filter === 'checked') return entries.filter(b => b.checked_in);
    if (filter === 'pending') return entries.filter(b => !b.checked_in);
    return entries;
  }, [entries, filter]);

  const stats = useMemo(() => {
    const checkedIn = bookings.filter(b => b.checked_in).length;
    const totalGuests = bookings.reduce((s, b) => s + (b.quantity || 1), 0);
    const revenue = bookings
      .filter(b => b.status === 'confirmed')
      .reduce((s, b) => s + parseFloat(b.total_price || 0), 0);
    return { checkedIn, totalGuests, revenue };
  }, [bookings]);

  if (loading || !event) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 60 }}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(business)'))} hitSlop={10}>
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
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(business)'))} hitSlop={10}>
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </View>
        </Pressable>
        <Text style={{ flex: 1, fontFamily: FONT_FAMILY.display, color: '#fff', fontSize: 17, marginLeft: 12 }}>Dettaglio evento</Text>
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
      {/* Header evento */}
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
      </View>

      {/* Stats */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, gap: 8, marginBottom: 18 }}>
        <StatCard label="Ingressi" value={entries.length} />
        <StatCard label="Tavoli" value={eventTables.length} />
        <StatCard label="Check-in" value={`${stats.checkedIn}/${bookings.length}`} />
        <StatCard label="Incassi" value={`€${stats.revenue.toFixed(0)}`} />
        <StatCard label="Ospiti" value={stats.totalGuests} />
        {event.capacity && (
          <StatCard label="Capienza" value={`${event.booked_count || 0}/${event.capacity}`} />
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
              Crea le tipologie (es. Standard 300 €, Premium 400 €...) per permettere agli utenti di prenotare i tavoli per questa serata.
            </Text>
          </View>
        ) : (
          tableTypes.map(t => {
            const used = eventTables.filter(x => x.type_id === t.id).length;
            return (
              <View key={t.id} style={{ backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 14, marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={{ color: COLORS.textPrimary, fontWeight: '700', fontSize: 14 }}>
                      {t.name} · {euro(t.total_price)}
                    </Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                      max {t.max_people} persone · {used}/{t.tables_count} prenotati
                    </Text>
                    {t.includes ? (
                      <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 3 }} numberOfLines={2}>{t.includes}</Text>
                    ) : null}
                  </View>
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

        {/* Tavoli prenotati con membri */}
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

              {members.map(m => {
                const age = calcAge(m.profiles?.birth_date);
                return (
                  <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.borderSubtle }}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={{ color: COLORS.textPrimary, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
                        {m.snapshot_full_name || m.profiles?.full_name || 'Utente'}
                      </Text>
                      <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 2 }}>
                        {m.profiles?.gender ? `${GENDER_LABEL[m.profiles.gender]} · ` : ''}{age != null ? `${age} anni · ` : ''}quota {euro(m.total_price)}
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
                );
              })}
            </View>
          );
        })}
      </View>

      {/* ============================ INGRESSI ============================ */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingBottom: 12 }}>
        {FILTERS.map(f => {
          const active = filter === f.id;
          return (
            <Pressable key={f.id} onPress={() => setFilter(f.id)}
              style={{
                paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
                backgroundColor: active ? '#FAFAFA' : COLORS.bgElev2,
              }}>
              <Text style={{ color: active ? COLORS.bg : COLORS.textSecondary, fontSize: 12, fontWeight: active ? '700' : '500' }}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingBottom: 60 }}>
        <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 }}>
          Lista ingressi ({filtered.length})
        </Text>

        {filtered.length === 0 ? (
          <View style={{ backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 28, alignItems: 'center' }}>
            <Text style={{ color: COLORS.textPrimary, fontSize: 14, fontWeight: '600', marginBottom: 4 }}>
              Nessun ospite
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 12, textAlign: 'center' }}>
              {entries.length === 0
                ? 'Nessuna prenotazione ingresso per questo evento.'
                : 'Cambia filtro per vedere altri ospiti.'}
            </Text>
          </View>
        ) : filtered.map(b => {
          const age = calcAge(b.profiles?.birth_date);
          return (
            <View key={b.id} style={{
              backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 14,
              marginBottom: 8,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.textPrimary, fontWeight: '600', fontSize: 14 }} numberOfLines={1}>
                    {b.snapshot_full_name || b.profiles?.full_name || 'Utente'}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    {b.profiles?.gender && (
                      <Text style={{ color: COLORS.textSecondary, fontSize: 11 }}>{GENDER_LABEL[b.profiles.gender]}</Text>
                    )}
                    {age != null && (
                      <Text style={{ color: COLORS.textSecondary, fontSize: 11 }}>· {age} anni</Text>
                    )}
                    <Text style={{ color: COLORS.textMuted, fontSize: 11 }}>
                      · {b.quantity} {b.quantity > 1 ? 'ingressi' : 'ingresso'}
                    </Text>
                  </View>
                  {b.profiles?.phone && (
                    <Text style={{ color: COLORS.textDisabled, fontSize: 11, marginTop: 3 }} selectable>
                      {b.profiles.phone}
                    </Text>
                  )}
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
          );
        })}
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
