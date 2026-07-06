import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Share, Alert, Linking, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useI18n } from '../../lib/i18n';
import { useSession } from '../../lib/useSession';
import { COLORS_BY_CAT, formatDateFull, formatTime, isPastDate, getPriceLabel } from '@lets-night/shared';
import BookingModal from '../../components/BookingModal';
import TableBookingModal from '../../components/TableBookingModal';
import { scheduleEventReminder, cancelReminder } from '../../lib/notifications';

export default function EventDetailScreen() {
  const { t, tLabel, fmtDateFull, fmtPrice } = useI18n();
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [event, setEvent] = useState(null);
  const [otherEvents, setOtherEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [reminderId, setReminderId] = useState(null);
  const { session } = useSession();
  const [bookingVisible, setBookingVisible] = useState(false);
  const [tableTypes, setTableTypes] = useState([]);
  const [tables, setTables] = useState([]);
  const [tableModal, setTableModal] = useState(null); // { action:'open', type } | { action:'join', table }

  async function loadTables() {
    const [{ data: tt }, { data: ts }] = await Promise.all([
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
    setTableTypes(tt || []);
    setTables(ts || []);
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from('events')
        .select('*, venues(id, name, zona, city, address, phone, description, category, cover_image)')
        .eq('id', id)
        .eq('is_active', true)
        .maybeSingle();

      if (error || !data) { setNotFound(true); setLoading(false); return; }
      setEvent(data);
      loadTables();

      if (data.venues?.id) {
        const today = new Date().toISOString().split('T')[0];
        const { data: others } = await supabase
          .from('events')
          .select('*, venues(name, zona, city, cover_image)')
          .eq('venue_id', data.venues.id)
          .eq('is_active', true)
          .neq('id', id)
          .gte('event_date', today)
          .order('event_date', { ascending: true })
          .limit(4);
        setOtherEvents(others || []);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  async function handleShare() {
    if (!event) return;
    await Share.share({
      message: `${event.title} — ${event.venues?.name}\n${fmtDateFull(event.event_date)} ${t('eventDetail.shareAt')} ${formatTime(event.event_time)}\n\n${t('eventDetail.shareMsg')}`,
    });
  }

  // Guard comune: serve un account utente (non business) loggato.
  async function guardBooking() {
    if (!session) {
      Alert.alert(
        t('eventDetail.loginToBookTitle'),
        t('eventDetail.loginToBookBody'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('auth.login'), onPress: () => router.push('/auth/login') },
        ]
      );
      return false;
    }
    // Coerenza con il web: gli account business non prenotano eventi.
    const { data: prof } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .maybeSingle();
    if (prof?.role === 'business') {
      Alert.alert(t('eventDetail.bizAccountTitle'), t('eventDetail.bizAccountBody'));
      return false;
    }
    return true;
  }

  async function handleBook() {
    if (await guardBooking()) setBookingVisible(true);
  }

  async function handleTable(mode) {
    if (await guardBooking()) setTableModal(mode);
  }

  function handleMaps() {
    const query = encodeURIComponent(
      event.venues?.address || `${event.venues?.name}, ${event.venues?.city}`
    );
    Alert.alert(
      t('eventDetail.openWith'),
      null,
      [
        {
          text: 'Apple Maps',
          onPress: () => Linking.openURL(`maps:?q=${query}`),
        },
        {
          text: 'Google Maps',
          onPress: () => Linking.openURL(`comgooglemaps://?q=${query}`).catch(() =>
            Linking.openURL(`https://maps.google.com/?q=${query}`)
          ),
        },
        { text: t('common.cancel'), style: 'cancel' },
      ]
    );
  }

  if (loading) {
    return (
      <View className="flex-1 bg-dark items-center justify-center">
        <ActivityIndicator color="#A855F7" size="large" />
      </View>
    );
  }

  if (notFound || !event) {
    return (
      <View className="flex-1 bg-dark items-center justify-center px-6">
        <Text className="text-white text-xl font-bold mb-2">{t('eventDetail.notFoundTitle')}</Text>
        <Text className="text-gray-400 text-center">{t('eventDetail.notFoundBody')}</Text>
      </View>
    );
  }

  const colors = COLORS_BY_CAT[event.category] || ['#1a0533', '#0d0d1a', '#c084fc'];
  const photo = event.cover_image || null;
  const isPast = isPastDate(event.event_date);

  return (
    <>
      <ScrollView className="flex-1 bg-dark">
        {/* Hero */}
        <View style={{ backgroundColor: colors[0], height: 200 }} className="relative justify-end p-5">
          {photo && (
            <>
              <Image source={{ uri: photo }} resizeMode="cover" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' }} />
            </>
          )}
          <View className="absolute top-4 right-4">
            <View className="bg-black/40 px-3 py-1 rounded-full">
              <Text className="text-white text-xs font-semibold">{tLabel(event.category)}</Text>
            </View>
          </View>
          <Text className="text-white text-2xl font-bold leading-tight">{event.title}</Text>
          <Text className="text-gray-300 mt-1">{event.venues?.name}</Text>
        </View>

        <View className="px-5 pt-5 pb-10">
          {/* Info principali */}
          <View className="bg-card rounded-2xl p-5 mb-4">
            <View className="flex-row justify-between mb-4">
              <View>
                <Text className="text-gray-400 text-xs mb-1">{t('eventDetail.date')}</Text>
                <Text className="text-white font-semibold">{fmtDateFull(event.event_date)}</Text>
              </View>
              <View className="items-end">
                <Text className="text-gray-400 text-xs mb-1">{t('eventDetail.time')}</Text>
                <Text className="text-white font-semibold">{formatTime(event.event_time) || '—'}</Text>
              </View>
            </View>
            <View className="flex-row justify-between">
              <View>
                <Text className="text-gray-400 text-xs mb-1">{t('eventDetail.where')}</Text>
                {event.venues?.id ? (
                  <Pressable onPress={() => router.push(`/venue/${event.venues.id}`)}>
                    <Text className="text-brand-light font-semibold">{event.venues?.zona}, {event.venues?.city}</Text>
                  </Pressable>
                ) : (
                  <Text className="text-white font-semibold">{event.venues?.zona}, {event.venues?.city}</Text>
                )}
              </View>
              <View className="items-end">
                <Text className="text-gray-400 text-xs mb-1">{t('eventDetail.price')}</Text>
                <Text className="text-brand font-bold text-lg">{fmtPrice(event.price)}</Text>
              </View>
            </View>
            {event.capacity != null && event.capacity > 0 && (() => {
              const available = event.capacity - (event.booked_count || 0);
              const pct = Math.round((available / event.capacity) * 100);
              const color = pct >= 50 ? '#4ADE80' : pct >= 20 ? '#FBBF24' : '#F87171';
              return (
                <View className="flex-row justify-between mt-4 pt-4 border-t border-gray-800">
                  <Text className="text-gray-400 text-xs self-center">{t('eventDetail.availability')}</Text>
                  <Text style={{ color, fontWeight: '600', fontSize: 13 }}>{t('eventDetail.seats', { available, capacity: event.capacity })}</Text>
                </View>
              );
            })()}
          </View>

          {/* Locale */}
          {event.venues?.id && (
            <Pressable
              onPress={() => router.push(`/venue/${event.venues.id}`)}
              className="bg-card rounded-2xl p-4 mb-4 flex-row items-center justify-between"
            >
              <View className="flex-1">
                <Text className="text-gray-400 text-xs mb-1">{t('eventDetail.venueLabel')}</Text>
                <Text className="text-white font-semibold">{event.venues.name}</Text>
                <Text className="text-gray-400 text-sm">{event.venues.zona}, {event.venues.city}</Text>
              </View>
              <Text className="text-brand-light text-lg">›</Text>
            </Pressable>
          )}

          {/* Mappa */}
          <Pressable
            onPress={handleMaps}
            className="bg-card rounded-2xl p-4 mb-4 flex-row items-center gap-3"
          >
            <Ionicons name="navigate-outline" size={20} color="#fff" />
            <View className="flex-1">
              <Text className="text-white font-semibold">{t('eventDetail.openMaps')}</Text>
              <Text className="text-gray-400 text-sm" numberOfLines={1}>
                {event.venues?.address || `${event.venues?.zona}, ${event.venues?.city}`}
              </Text>
            </View>
            <Text className="text-brand-light">›</Text>
          </Pressable>

          {/* Descrizione */}
          {event.description ? (
            <View className="mb-4">
              <Text className="text-white font-semibold text-base mb-2">{t('eventDetail.description')}</Text>
              <Text className="text-gray-400 leading-6">{event.description}</Text>
            </View>
          ) : null}

          {/* Bottoni azione */}
          {!isPast && (
            <View className="gap-3 mb-6">
              <View className="flex-row gap-3">
                <Pressable
                  onPress={handleBook}
                  className="flex-1 bg-brand rounded-xl py-4 items-center"
                >
                  <Text className="text-white font-bold text-base">{t('eventDetail.book')}</Text>
                </Pressable>
                <Pressable
                  onPress={handleShare}
                  className="border border-gray-700 rounded-xl py-4 px-5 items-center"
                >
                  <Text className="text-white">{t('eventDetail.share')}</Text>
                </Pressable>
              </View>
              {/* Promemoria */}
              <Pressable
                onPress={async () => {
                  if (reminderId) {
                    await cancelReminder(reminderId);
                    setReminderId(null);
                    Alert.alert(t('eventDetail.reminderRemovedTitle'), t('eventDetail.reminderRemovedBody'));
                  } else {
                    const id = await scheduleEventReminder(event);
                    if (id) {
                      setReminderId(id);
                      Alert.alert(t('eventDetail.reminderSetTitle'), t('eventDetail.reminderSetBody'));
                    } else {
                      Alert.alert(t('eventDetail.reminderNATitle'), t('eventDetail.reminderNABody'));
                    }
                  }
                }}
                style={({ pressed }) => ({
                  borderWidth: 1,
                  borderColor: reminderId ? 'rgba(168,85,247,0.5)' : 'rgba(255,255,255,0.1)',
                  borderRadius: 12, paddingVertical: 12, alignItems: 'center',
                  backgroundColor: reminderId ? 'rgba(168,85,247,0.1)' : 'transparent',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="notifications-outline" size={16} color={reminderId ? '#A855F7' : '#9CA3AF'} />
                  <Text style={{ color: reminderId ? '#A855F7' : '#9CA3AF', fontSize: 14, fontWeight: '600' }}>
                    {reminderId ? t('eventDetail.reminderSet') : t('eventDetail.remindMe')}
                  </Text>
                </View>
              </Pressable>
            </View>
          )}

          {/* Tavoli */}
          {!isPast && tableTypes.length > 0 && (
            <View className="mb-6">
              <Text className="text-white font-semibold text-base mb-1">{t('eventDetail.tables')}</Text>
              <Text className="text-gray-400 text-xs mb-3">
                {t('eventDetail.tablesSub')}
              </Text>

              {tableTypes.map(tt => {
                const used = tables.filter(x => x.type_id === tt.id).length;
                const left = Math.max(0, (tt.tables_count || 0) - used);
                return (
                  <View key={tt.id} className="bg-card rounded-2xl p-4 mb-3">
                    <View className="flex-row justify-between items-start mb-1">
                      <Text className="text-white font-semibold text-base flex-1 mr-3">{tt.name}</Text>
                      <Text className="text-white font-bold text-base">{Number(tt.total_price)} €</Text>
                    </View>
                    <Text className="text-gray-400 text-xs mb-1">
                      {t('eventDetail.upTo', { max: tt.max_people })} · {left === 0 ? t('eventDetail.slotsNone') : t('eventDetail.slotsCount', { count: left })}
                    </Text>
                    {tt.includes ? (
                      <Text className="text-gray-400 text-sm mb-3 leading-5">{tt.includes}</Text>
                    ) : (
                      <View className="mb-2" />
                    )}
                    <Pressable
                      disabled={left === 0}
                      onPress={() => handleTable({ action: 'open', type: tt })}
                      className={`rounded-xl py-3 items-center ${left === 0 ? 'bg-card2' : 'bg-brand'}`}
                    >
                      <Text className={left === 0 ? 'text-gray-500 font-semibold' : 'text-white font-bold'}>
                        {left === 0 ? t('eventDetail.soldOutBtn') : t('eventDetail.openTable')}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}

              {tables.filter(x => x.visibility === 'public' && x.status === 'open').length > 0 && (
                <View className="mt-1">
                  <Text className="text-gray-400 text-xs mb-2" style={{ letterSpacing: 1.2, textTransform: 'uppercase' }}>
                    {t('eventDetail.openTablesJoin')}
                  </Text>
                  {tables.filter(x => x.visibility === 'public' && x.status === 'open').map(tb => {
                    const remaining = Math.max(0, Number(tb.total_price) - Number(tb.collected || 0));
                    return (
                      <Pressable
                        key={tb.id}
                        onPress={() => handleTable({ action: 'join', table: tb })}
                        className="bg-card rounded-2xl p-4 mb-2 flex-row items-center justify-between"
                      >
                        <View className="flex-1 mr-3">
                          <Text className="text-white font-semibold">{tb.event_table_types?.name || t('eventDetail.tableFallback')}</Text>
                          <Text className="text-gray-400 text-xs mt-1">
                            {t('eventDetail.tableStatus', { count: tb.people_count, max: tb.max_people, remaining: remaining.toFixed(0) })}
                          </Text>
                        </View>
                        <Text className="text-brand-light font-semibold">{t('eventDetail.join')}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* Altri eventi del locale */}
          {otherEvents.length > 0 && (
            <View>
              <Text className="text-white font-semibold text-base mb-3">
                {t('eventDetail.otherEventsAt', { venue: event.venues?.name })}
              </Text>
              <View className="gap-3">
                {otherEvents.map(ev => (
                  <Pressable
                    key={ev.id}
                    onPress={() => router.push(`/event/${ev.id}`)}
                    className="bg-card rounded-xl p-4 flex-row justify-between items-center"
                  >
                    <View className="flex-1 mr-3">
                      <Text className="text-white font-semibold" numberOfLines={1}>{ev.title}</Text>
                      <Text className="text-gray-400 text-sm mt-1">
                        {fmtDateFull(ev.event_date)} · {formatTime(ev.event_time)}
                      </Text>
                    </View>
                    <Text className="text-brand font-semibold">{fmtPrice(ev.price)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      <BookingModal
        visible={bookingVisible}
        onClose={() => setBookingVisible(false)}
        // Con le tipologie tavolo attive, il toggle "Tavolo" legacy della modal
        // biglietti viene nascosto: i tavoli passano dal nuovo flusso quote.
        event={tableTypes.length > 0 ? { ...event, has_tables: false } : event}
        session={session}
      />

      <TableBookingModal
        visible={!!tableModal}
        mode={tableModal}
        onClose={() => setTableModal(null)}
        event={event}
        session={session}
        onSuccess={loadTables}
      />
    </>
  );
}
