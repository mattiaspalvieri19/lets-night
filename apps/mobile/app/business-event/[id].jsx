import { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, Alert, Modal, TextInput, KeyboardAvoidingView, Platform, Switch } from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useI18n } from '../../lib/i18n';
import { COLORS, FONT_FAMILY, formatTime } from '@lets-night/shared';
import EventFormModal from '../../components/EventFormModal';

// Sezione EVENTI = solo configurazione: dati evento, tipologie di ingresso,
// tipologie tavolo. L'operatività (nominativi, check-in, tavoli prenotati)
// vive nella tab Prenotazioni — qui c'è solo il bottone che ci porta.

const EMPTY_TYPE = { name: '', total_price: '', max_people: '8', includes: '', tables_count: '1' };
const EMPTY_TICKET = { name: '', description: '', price: '', drinks_included: '0', quantity: '', is_active: true };

function parseNum(str) {
  const n = parseFloat(String(str).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

function euro(v) {
  return Number(v).toFixed(2).replace('.', ',').replace(',00', '') + ' €';
}

export default function BusinessEventDetailScreen() {
  const { t, tLabel, fmtDateFull, fmtPrice } = useI18n();
  const { id } = useLocalSearchParams();
  const [event, setEvent] = useState(null);
  const [bookingsLite, setBookingsLite] = useState([]);
  const [ticketTypes, setTicketTypes] = useState([]);
  const [tableTypes, setTableTypes] = useState([]);
  const [eventTables, setEventTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [typeModal, setTypeModal] = useState(null);     // tipologia TAVOLO: null | {} | { id }
  const [ticketModal, setTicketModal] = useState(null); // tipologia INGRESSO: null | {} | { id }
  const [editModal, setEditModal] = useState(false);
  const [typeForm, setTypeForm] = useState(EMPTY_TYPE);
  const [ticketForm, setTicketForm] = useState(EMPTY_TICKET);
  const [savingType, setSavingType] = useState(false);

  function deleteEvent() {
    Alert.alert(
      t('bizEvent.delTitle'),
      t('bizEvent.delBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.delete'), style: 'destructive', onPress: async () => {
          const { count, error: countErr } = await supabase
            .from('bookings')
            .select('id', { count: 'exact', head: true })
            .eq('event_id', id)
            .not('status', 'in', '("cancelled","denied")');
          if (countErr) {
            Alert.alert(t('common.error'), t('bizEvent.delCheckFail'));
            return;
          }
          if (count && count > 0) {
            Alert.alert(t('bizEvent.notDeletable'), t('bizEvent.delHasBookings'));
            return;
          }
          const { error } = await supabase.from('events').delete().eq('id', id);
          if (error) {
            Alert.alert(t('bizEvent.notDeletable'), t('bizEvent.delHasData'));
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
      Alert.alert(t('bizEvent.accessDeniedT'), t('bizEvent.accessDeniedB'));
      router.back();
      return;
    }
    setEvent(ev);

    // Prenotazioni "light": servono solo per i contatori (venduti per tipologia,
    // tavoli usati). I nominativi stanno nella tab Prenotazioni.
    const [{ data: bks }, { data: tk }, { data: tt }, { data: ts }] = await Promise.all([
      supabase
        .from('bookings')
        .select('id, quantity, ticket_type_id, table_id')
        .eq('event_id', id)
        .not('status', 'in', '("cancelled","denied")'),
      supabase
        .from('event_ticket_types')
        .select('*')
        .eq('event_id', id)
        .order('sort_order', { ascending: true })
        .order('price', { ascending: true }),
      supabase
        .from('event_table_types')
        .select('*')
        .eq('event_id', id)
        .order('total_price', { ascending: true }),
      supabase
        .from('event_tables')
        .select('id, type_id, status')
        .eq('event_id', id)
        .neq('status', 'cancelled'),
    ]);
    setBookingsLite(bks || []);
    setTicketTypes(tk || []);
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

  // ================== TIPOLOGIE DI INGRESSO (CRUD locale) ==================
  const soldByTicketType = useMemo(() => {
    const map = {};
    for (const b of bookingsLite) {
      if (!b.ticket_type_id) continue;
      map[b.ticket_type_id] = (map[b.ticket_type_id] || 0) + (Number(b.quantity) || 1);
    }
    return map;
  }, [bookingsLite]);

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
    const price = parseNum(ticketForm.price);
    const drinks = ticketForm.drinks_included === '' ? 0 : parseInt(ticketForm.drinks_included, 10);
    const qty = ticketForm.quantity.trim() === '' ? null : parseInt(ticketForm.quantity, 10);
    if (!ticketForm.name.trim()) { Alert.alert(t('bizEvent.typeNameMissingT'), t('bizEvent.ttNameMissingB')); return; }
    if (!Number.isFinite(price) || price < 0) { Alert.alert(t('bizEvent.typePriceT'), t('bizEvent.ttPriceMissingB')); return; }
    if (!Number.isInteger(drinks) || drinks < 0) { Alert.alert(t('common.error'), t('bizEvent.ttfDrinks')); return; }
    if (qty !== null && (!Number.isInteger(qty) || qty < 1)) { Alert.alert(t('common.error'), t('bizEvent.ttQtyBadB')); return; }

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
    if (error) { Alert.alert(t('common.error'), error.message); return; }
    setTicketModal(null);
    loadData();
  }

  async function deactivateTicketType(tk) {
    const { error } = await supabase.from('event_ticket_types').update({ is_active: false }).eq('id', tk.id);
    if (error) { Alert.alert(t('common.error'), error.message); return; }
    loadData();
  }

  function confirmDeleteTicketType(tk) {
    Alert.alert(
      t('bizEvent.ttDelTitle'),
      `"${tk.name}" — ${t('bizEvent.ttDelBody')}`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'), style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('event_ticket_types').delete().eq('id', tk.id);
            if (error) {
              // FK: esistono prenotazioni con questa tipologia → si può solo disattivare.
              Alert.alert(
                t('bizEvent.notDeletable'),
                t('bizEvent.ttDelHasBookings'),
                [
                  { text: t('common.cancel'), style: 'cancel' },
                  { text: t('bizEvent.ttDeactivate'), onPress: () => deactivateTicketType(tk) },
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
    if (!typeForm.name.trim()) { Alert.alert(t('bizEvent.typeNameMissingT'), t('bizEvent.typeNameMissingB')); return; }
    if (!Number.isFinite(price) || price <= 0) { Alert.alert(t('bizEvent.typePriceT'), t('bizEvent.typePriceB')); return; }
    if (!Number.isInteger(maxP) || maxP < 1 || maxP > 30) { Alert.alert(t('bizEvent.typePeopleT'), t('bizEvent.typePeopleB')); return; }
    if (!Number.isInteger(count) || count < 0) { Alert.alert(t('bizEvent.typeCountT'), t('bizEvent.typeCountB')); return; }

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
    if (error) { Alert.alert(t('common.error'), error.message); return; }
    setTypeModal(null);
    loadData();
  }

  function confirmDeleteType(type) {
    Alert.alert(
      t('bizEvent.typeDelTitle'),
      `"${type.name}" non sarà più prenotabile.`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'), style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('event_table_types').delete().eq('id', type.id);
            if (error) {
              // FK restrict: esistono tavoli già aperti su questa tipologia.
              Alert.alert(t('bizEvent.notDeletable'), t('bizEvent.typeDelHasTables'));
              return;
            }
            loadData();
          },
        },
      ]
    );
  }

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
        <Text style={{ flex: 1, fontFamily: FONT_FAMILY.display, color: '#fff', fontSize: 17, marginLeft: 12 }}>{t('bizEvent.headerTitle')}</Text>
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
          {tLabel(event.category)}
        </Text>
        <Text style={{ fontFamily: FONT_FAMILY.displayHeavy, color: COLORS.textPrimary, fontSize: 23, lineHeight: 28, letterSpacing: -0.4 }}>{event.title}</Text>
        <Text style={{ color: COLORS.textSecondary, fontSize: 13, marginTop: 6 }}>
          {fmtDateFull(event.event_date)} · {formatTime(event.event_time)}
        </Text>
        <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 4 }}>
          {event.venues?.name} · {event.venues?.zona}, {event.venues?.city}
        </Text>
      </View>

      {/* Vedi prenotazioni → tab Prenotazioni (filtro già su questo evento) */}
      <View style={{ paddingHorizontal: 20, marginBottom: 22 }}>
        <Pressable
          onPress={() => router.push({ pathname: '/(business)/bookings', params: { event: String(id) } })}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 16,
            borderWidth: 1, borderColor: COLORS.borderSubtle,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="list" size={18} color={COLORS.brand} />
            <Text style={{ color: COLORS.textPrimary, fontWeight: '700', fontSize: 14 }}>{t('bizEvent.viewBookings')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
        </Pressable>
      </View>

      {/* ====================== TIPOLOGIE DI INGRESSO ====================== */}
      <View style={{ paddingHorizontal: 20, marginBottom: 22 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 18, letterSpacing: -0.3 }}>{t('bizEvent.ttSection')}</Text>
          <Pressable
            onPress={() => openTicketModal(null)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.brandStrong, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, opacity: pressed ? 0.85 : 1 })}
          >
            <Ionicons name="add" size={14} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{t('bizEvent.ttAdd')}</Text>
          </Pressable>
        </View>

        {ticketTypes.length === 0 ? (
          <View style={{ backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 18 }}>
            <Text style={{ color: COLORS.textPrimary, fontWeight: '600', fontSize: 13, marginBottom: 4 }}>{t('bizEvent.noTt')}</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 12, lineHeight: 17 }}>
              {t('bizEvent.noTtSub')}
            </Text>
          </View>
        ) : (
          <>
            {ticketTypes.map(tk => {
              const sold = soldByTicketType[tk.id] || 0;
              const drinks = Number(tk.drinks_included) || 0;
              return (
                <View key={tk.id} style={{ backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 14, marginBottom: 8, opacity: tk.is_active ? 1 : 0.55 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Text style={{ color: COLORS.textPrimary, fontWeight: '700', fontSize: 14 }}>
                          {tk.name} · {fmtPrice(Math.max(0, Number(tk.price) || 0))}
                        </Text>
                        {!tk.is_active && (
                          <View style={{ backgroundColor: 'rgba(245,158,11,0.12)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}>
                            <Text style={{ color: COLORS.warning, fontSize: 10, fontWeight: '700' }}>{t('bizEvent.ttInactive')}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                        {tk.quantity != null
                          ? t('bizEvent.ttSoldMeta', { sold, qty: tk.quantity })
                          : t('bizEvent.ttSoldMetaUnl', { sold })}
                        {drinks > 0 ? ` · ${drinks === 1 ? t('booking.drinkOne') : t('booking.drinkMany', { count: drinks })}` : ''}
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
            })}
            <Text style={{ color: COLORS.textDisabled, fontSize: 11, lineHeight: 15, marginTop: 2 }}>
              {t('bizEvent.ttBaseNote')}
            </Text>
          </>
        )}
      </View>

      {/* ====================== TIPOLOGIE TAVOLO ====================== */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 60 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 18, letterSpacing: -0.3 }}>{t('bizEvent.tablesSection')}</Text>
          <Pressable
            onPress={() => openTypeModal(null)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.brandStrong, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, opacity: pressed ? 0.85 : 1 })}
          >
            <Ionicons name="add" size={14} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{t('bizEvent.typeBtn')}</Text>
          </Pressable>
        </View>

        {tableTypes.length === 0 ? (
          <View style={{ backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 18 }}>
            <Text style={{ color: COLORS.textPrimary, fontWeight: '600', fontSize: 13, marginBottom: 4 }}>{t('bizEvent.noTypes')}</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 12, lineHeight: 17 }}>
              {t('bizEvent.noTypesSub')}
            </Text>
          </View>
        ) : (
          tableTypes.map(tt => {
            const used = eventTables.filter(x => x.type_id === tt.id).length;
            return (
              <View key={tt.id} style={{ backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 14, marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={{ color: COLORS.textPrimary, fontWeight: '700', fontSize: 14 }}>
                      {tt.name} · {euro(tt.total_price)}
                    </Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                      {t('bizEvent.typeMeta', { max: tt.max_people, used, count: tt.tables_count })}
                    </Text>
                    {tt.includes ? (
                      <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 3 }} numberOfLines={2}>{tt.includes}</Text>
                    ) : null}
                  </View>
                  <Pressable onPress={() => openTypeModal(tt)} hitSlop={8} style={{ padding: 6 }}>
                    <Ionicons name="create-outline" size={17} color={COLORS.textSecondary} />
                  </Pressable>
                  <Pressable onPress={() => confirmDeleteType(tt)} hitSlop={8} style={{ padding: 6 }}>
                    <Ionicons name="trash-outline" size={17} color={COLORS.danger} />
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </View>

      {event && (
        <EventFormModal
          visible={editModal}
          mode="edit"
          event={event}
          hasActiveTicketTypes={ticketTypes.some(tk => tk.is_active)}
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
                {savingType ? <ActivityIndicator size="small" color={COLORS.textPrimary} /> : <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 15 }}>{ticketModal?.id ? t('bizEvent.saveType') : t('bizEvent.createType')}</Text>}
              </Pressable>
              <Pressable onPress={() => setTicketModal(null)} hitSlop={8}>
                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
              <TypeField label={t('bizEvent.ttfName')} value={ticketForm.name} onChange={v => setTicketForm(f => ({ ...f, name: v }))} placeholder={t('bizEvent.ttfNamePh')} />
              <TypeField label={t('bizEvent.ttfDesc')} value={ticketForm.description} onChange={v => setTicketForm(f => ({ ...f, description: v }))} placeholder={t('bizEvent.ttfDescPh')} multiline />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <TypeField label={t('bizEvent.ttfPrice')} value={ticketForm.price} onChange={v => setTicketForm(f => ({ ...f, price: v }))} placeholder="15" keyboardType="decimal-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <TypeField label={t('bizEvent.ttfDrinks')} value={ticketForm.drinks_included} onChange={v => setTicketForm(f => ({ ...f, drinks_included: v }))} placeholder="0" keyboardType="number-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <TypeField label={t('bizEvent.ttfQty')} value={ticketForm.quantity} onChange={v => setTicketForm(f => ({ ...f, quantity: v }))} placeholder={t('bizEvent.ttfQtyPh')} keyboardType="number-pad" />
                </View>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingVertical: 4 }}>
                <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase' }}>{t('bizEvent.ttfActive')}</Text>
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

      {/* ====================== MODAL TIPOLOGIA TAVOLO ====================== */}
      <Modal visible={!!typeModal} transparent animationType="slide" onRequestClose={() => setTypeModal(null)}>
        <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={() => setTypeModal(null)} />
          <View style={{ backgroundColor: COLORS.bgElev2, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 30, maxHeight: '88%' }}>
            <View style={{ width: 36, height: 4, backgroundColor: COLORS.borderStrong, borderRadius: 2, alignSelf: 'center', marginBottom: 16 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <Pressable onPress={saveType} disabled={savingType} hitSlop={8}
                style={({ pressed }) => ({ opacity: savingType || pressed ? 0.5 : 1 })}>
                {savingType ? <ActivityIndicator size="small" color={COLORS.textPrimary} /> : <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 15 }}>{typeModal?.id ? t('bizEvent.saveType') : t('bizEvent.createType')}</Text>}
              </Pressable>
              <Pressable onPress={() => setTypeModal(null)} hitSlop={8}>
                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
              <TypeField label={t('bizEvent.tfName')} value={typeForm.name} onChange={v => setTypeForm(f => ({ ...f, name: v }))} placeholder={t('bizEvent.tfNamePh')} />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <TypeField label={t('bizEvent.tfPrice')} value={typeForm.total_price} onChange={v => setTypeForm(f => ({ ...f, total_price: v }))} placeholder="300" keyboardType="decimal-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <TypeField label={t('bizEvent.tfMaxPeople')} value={typeForm.max_people} onChange={v => setTypeForm(f => ({ ...f, max_people: v }))} placeholder="8" keyboardType="number-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <TypeField label={t('bizEvent.tfCount')} value={typeForm.tables_count} onChange={v => setTypeForm(f => ({ ...f, tables_count: v }))} placeholder="1" keyboardType="number-pad" />
                </View>
              </View>
              <TypeField label={t('bizEvent.tfIncludes')} value={typeForm.includes} onChange={v => setTypeForm(f => ({ ...f, includes: v }))} placeholder={t('bizEvent.tfIncludesPh')} multiline />
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
