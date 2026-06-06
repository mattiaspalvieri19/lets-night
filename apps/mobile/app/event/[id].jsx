import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Share, Alert, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';
import { COLORS_BY_CAT, formatDateFull, formatTime, isPastDate, getPriceLabel } from '@lets-night/shared';
import BookingModal from '../../components/BookingModal';
import { scheduleEventReminder, cancelReminder } from '../../lib/notifications';

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [event, setEvent] = useState(null);
  const [otherEvents, setOtherEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [reminderId, setReminderId] = useState(null);
  const { session } = useSession();
  const [bookingVisible, setBookingVisible] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from('events')
        .select('*, venues(id, name, zona, city, address, phone, description, category)')
        .eq('id', id)
        .eq('is_active', true)
        .maybeSingle();

      if (error || !data) { setNotFound(true); setLoading(false); return; }
      setEvent(data);

      if (data.venues?.id) {
        const today = new Date().toISOString().split('T')[0];
        const { data: others } = await supabase
          .from('events')
          .select('*, venues(name, zona, city)')
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
      message: `${event.title} — ${event.venues?.name}\n${formatDateFull(event.event_date)} alle ${formatTime(event.event_time)}\n\nTrova questo evento su Let's Night!`,
    });
  }

  function handleBook() {
    if (!session) {
      Alert.alert(
        'Accedi per prenotare',
        'Devi essere registrato per prenotare un evento.',
        [
          { text: 'Annulla', style: 'cancel' },
          { text: 'Accedi', onPress: () => router.push('/auth/login') },
        ]
      );
      return;
    }
    setBookingVisible(true);
  }

  function handleMaps() {
    const query = encodeURIComponent(
      event.venues?.address || `${event.venues?.name}, ${event.venues?.city}`
    );
    Alert.alert(
      'Apri con',
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
        { text: 'Annulla', style: 'cancel' },
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
        <Text className="text-white text-xl font-bold mb-2">Evento non trovato</Text>
        <Text className="text-gray-400 text-center">Questo evento non esiste o è stato rimosso.</Text>
      </View>
    );
  }

  const colors = COLORS_BY_CAT[event.category] || ['#1a0533', '#0d0d1a', '#c084fc'];
  const isPast = isPastDate(event.event_date);

  return (
    <>
      <ScrollView className="flex-1 bg-dark">
        {/* Hero */}
        <View style={{ backgroundColor: colors[0], height: 200 }} className="relative justify-end p-5">
          <View className="absolute top-4 right-4">
            <View className="bg-black/40 px-3 py-1 rounded-full">
              <Text className="text-white text-xs font-semibold">{event.category}</Text>
            </View>
          </View>
          <View style={{ position: 'absolute', top: 16, left: 16, flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {event.is_sponsored && (
              <View className="px-3 py-1 rounded-full" style={{ backgroundColor: 'rgba(202,138,4,0.25)', borderWidth: 1, borderColor: 'rgba(234,179,8,0.4)' }}>
                <Text style={{ color: '#FBBF24', fontSize: 11, fontWeight: '700' }}>★ SPONSOR</Text>
              </View>
            )}
            {event.is_hot && !isPast && (
              <View className="px-3 py-1 rounded-full" style={{ backgroundColor: 'rgba(239,68,68,0.2)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)' }}>
                <Text style={{ color: '#F87171', fontSize: 11, fontWeight: '700' }}>🔥 HOT</Text>
              </View>
            )}
            {isPast && (
              <View className="bg-gray-800/80 px-3 py-1 rounded-full">
                <Text className="text-gray-400 text-xs">Evento passato</Text>
              </View>
            )}
          </View>
          <Text className="text-white text-2xl font-bold leading-tight">{event.title}</Text>
          <Text className="text-gray-300 mt-1">{event.venues?.name}</Text>
        </View>

        <View className="px-5 pt-5 pb-10">
          {/* Info principali */}
          <View className="bg-card rounded-2xl p-5 mb-4">
            <View className="flex-row justify-between mb-4">
              <View>
                <Text className="text-gray-400 text-xs mb-1">Data</Text>
                <Text className="text-white font-semibold">{formatDateFull(event.event_date)}</Text>
              </View>
              <View className="items-end">
                <Text className="text-gray-400 text-xs mb-1">Orario</Text>
                <Text className="text-white font-semibold">{formatTime(event.event_time) || '—'}</Text>
              </View>
            </View>
            <View className="flex-row justify-between">
              <View>
                <Text className="text-gray-400 text-xs mb-1">Dove</Text>
                {event.venues?.id ? (
                  <Pressable onPress={() => router.push(`/venue/${event.venues.id}`)}>
                    <Text className="text-brand-light font-semibold">{event.venues?.zona}, {event.venues?.city}</Text>
                  </Pressable>
                ) : (
                  <Text className="text-white font-semibold">{event.venues?.zona}, {event.venues?.city}</Text>
                )}
              </View>
              <View className="items-end">
                <Text className="text-gray-400 text-xs mb-1">Prezzo</Text>
                <Text className="text-brand font-bold text-lg">{getPriceLabel(event.price)}</Text>
              </View>
            </View>
            {event.capacity != null && event.capacity > 0 && (() => {
              const available = event.capacity - (event.booked_count || 0);
              const pct = Math.round((available / event.capacity) * 100);
              const color = pct >= 50 ? '#4ADE80' : pct >= 20 ? '#FBBF24' : '#F87171';
              return (
                <View className="flex-row justify-between mt-4 pt-4 border-t border-gray-800">
                  <Text className="text-gray-400 text-xs self-center">Disponibilità</Text>
                  <Text style={{ color, fontWeight: '600', fontSize: 13 }}>{available} / {event.capacity} posti</Text>
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
                <Text className="text-gray-400 text-xs mb-1">Locale</Text>
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
            <Text style={{ fontSize: 22 }}>📍</Text>
            <View className="flex-1">
              <Text className="text-white font-semibold">Apri in Maps</Text>
              <Text className="text-gray-400 text-sm" numberOfLines={1}>
                {event.venues?.address || `${event.venues?.zona}, ${event.venues?.city}`}
              </Text>
            </View>
            <Text className="text-brand-light">›</Text>
          </Pressable>

          {/* Descrizione */}
          {event.description ? (
            <View className="mb-4">
              <Text className="text-white font-semibold text-base mb-2">Descrizione</Text>
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
                  <Text className="text-white font-bold text-base">Prenota</Text>
                </Pressable>
                <Pressable
                  onPress={handleShare}
                  className="border border-gray-700 rounded-xl py-4 px-5 items-center"
                >
                  <Text className="text-white">Condividi</Text>
                </Pressable>
              </View>
              {/* Promemoria */}
              <Pressable
                onPress={async () => {
                  if (reminderId) {
                    await cancelReminder(reminderId);
                    setReminderId(null);
                    Alert.alert('Promemoria rimosso', 'Non riceverai più la notifica per questo evento.');
                  } else {
                    const id = await scheduleEventReminder(event);
                    if (id) {
                      setReminderId(id);
                      Alert.alert('Promemoria impostato', 'Ti avviseremo 24 ore prima dell\'evento.');
                    } else {
                      Alert.alert('Non disponibile', 'L\'evento è tra meno di 24 ore o già passato.');
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
                <Text style={{ color: reminderId ? '#A855F7' : '#9CA3AF', fontSize: 14, fontWeight: '600' }}>
                  {reminderId ? '🔔 Promemoria impostato' : '🔔 Ricordami 24h prima'}
                </Text>
              </Pressable>
            </View>
          )}

          {/* Altri eventi del locale */}
          {otherEvents.length > 0 && (
            <View>
              <Text className="text-white font-semibold text-base mb-3">
                Altri eventi a {event.venues?.name}
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
                        {formatDateFull(ev.event_date)} · {formatTime(ev.event_time)}
                      </Text>
                    </View>
                    <Text className="text-brand font-semibold">{getPriceLabel(ev.price)}</Text>
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
        event={event}
        session={session}
      />
    </>
  );
}
