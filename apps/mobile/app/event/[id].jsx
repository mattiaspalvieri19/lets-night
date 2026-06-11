import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Share, Alert, Linking, Image } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';
import { COLORS_BY_CAT, COLORS, FONT_FAMILY, formatDate, formatTime, isPastDate, getPriceLabel } from '@lets-night/shared';
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
        .select('*, venues(id, name, zona, city, address, phone, description, category, cover_image)')
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
      message: `${event.title} — ${event.venues?.name}\n${formatDate(event.event_date)} alle ${formatTime(event.event_time)}\n\nTrova questo evento su Let's Night!`,
    });
  }

  async function handleBook() {
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
    // Coerenza con il web: gli account business non prenotano eventi.
    const { data: prof } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .maybeSingle();
    if (prof?.role === 'business') {
      Alert.alert('Account business', 'Gli account business non possono prenotare eventi. Accedi con un account utente.');
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

  async function toggleReminder() {
    if (reminderId) {
      await cancelReminder(reminderId);
      setReminderId(null);
      Alert.alert('Promemoria rimosso', 'Non riceverai più la notifica per questo evento.');
    } else {
      const rid = await scheduleEventReminder(event);
      if (rid) {
        setReminderId(rid);
        Alert.alert('Promemoria impostato', 'Ti avviseremo 24 ore prima dell\'evento.');
      } else {
        Alert.alert('Non disponibile', 'L\'evento è tra meno di 24 ore o già passato.');
      }
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Stack.Screen options={{ title: '', headerTransparent: true }} />
        <ActivityIndicator color={COLORS.brand} size="large" />
      </View>
    );
  }

  if (notFound || !event) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <Stack.Screen options={{ title: '', headerTransparent: true }} />
        <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 20, marginBottom: 8 }}>Evento non trovato</Text>
        <Text style={{ color: COLORS.textMuted, textAlign: 'center' }}>Questo evento non esiste o è stato rimosso.</Text>
      </View>
    );
  }

  const accent = (COLORS_BY_CAT[event.category] || [])[2] || COLORS.brand;
  const photo = event.cover_image || event.venues?.cover_image || null;
  const past = isPastDate(event.event_date);

  const hasCapacity = event.capacity != null && event.capacity > 0;
  const available = hasCapacity ? event.capacity - (event.booked_count || 0) : null;
  const availPct = hasCapacity ? Math.round((available / event.capacity) * 100) : null;
  const availColor = !hasCapacity || availPct >= 50 ? COLORS.success : availPct >= 20 ? COLORS.warning : COLORS.danger;
  const soldOut = hasCapacity && available <= 0;

  const detailChips = [
    event.music_type,
    event.dress_code,
    event.age_target,
    ...(event.tags || []),
  ].filter(Boolean);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <Stack.Screen options={{ title: '', headerTransparent: true }} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>
        {/* Hero foto-first */}
        <View style={{ height: 380, backgroundColor: COLORS.bgElev1, overflow: 'hidden' }}>
          {photo ? (
            <Image source={{ uri: photo }} resizeMode="cover" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          ) : (
            <Text
              numberOfLines={1}
              style={{
                position: 'absolute', top: 120, left: -8,
                fontFamily: FONT_FAMILY.displayHeavy,
                fontSize: 130, letterSpacing: -5,
                color: accent, opacity: 0.12,
              }}
            >
              {(event.category || 'Night').toUpperCase()}
            </Text>
          )}
          {/* Scrim alto (leggibilità back chevron) + basso (testo) */}
          <LinearGradient
            colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)']}
            locations={[0, 1]}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 120 }}
          />
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.92)']}
            locations={[0.3, 0.65, 1]}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />

          {/* Badge in alto a destra */}
          <View style={{ position: 'absolute', top: 64, right: 16, flexDirection: 'row', gap: 6 }}>
            <View style={{ backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6, paddingHorizontal: 9, paddingVertical: 5 }}>
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' }}>
                {event.category}
              </Text>
            </View>
            {event.is_sponsored && (
              <View style={{ backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6, paddingHorizontal: 9, paddingVertical: 5 }}>
                <Text style={{ color: COLORS.warning, fontSize: 10, fontWeight: '700', letterSpacing: 0.8 }}>SPONSOR</Text>
              </View>
            )}
            {past && (
              <View style={{ backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6, paddingHorizontal: 9, paddingVertical: 5 }}>
                <Text style={{ color: COLORS.textSecondary, fontSize: 10, fontWeight: '700', letterSpacing: 0.8 }}>PASSATO</Text>
              </View>
            )}
          </View>

          {/* Blocco titolo */}
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20 }}>
            <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 8 }}>
              {formatDate(event.event_date)} · {formatTime(event.event_time) || '—'}
            </Text>
            <Text
              numberOfLines={3}
              style={{ fontFamily: FONT_FAMILY.displayHeavy, color: '#fff', fontSize: 32, lineHeight: 36, letterSpacing: -0.8, marginBottom: 10 }}
            >
              {event.title}
            </Text>
            {event.venues?.id && (
              <Pressable onPress={() => router.push(`/venue/${event.venues.id}`)} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600' }}>
                  {event.venues.name} · {event.venues.zona}
                </Text>
                <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.55)" />
              </Pressable>
            )}
          </View>
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 18 }}>
          {/* Chip dettagli (musica, dress code, età, tag) */}
          {detailChips.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {detailChips.map(c => (
                <View key={c} style={{ backgroundColor: COLORS.bgElev2, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 }}>
                  <Text style={{ color: COLORS.textSecondary, fontSize: 12, fontWeight: '500' }}>{c}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Disponibilità */}
          {hasCapacity && !past && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: availColor }} />
              <Text style={{ color: COLORS.textSecondary, fontSize: 13 }}>
                {soldOut
                  ? 'Posti esauriti'
                  : `${available} ${available === 1 ? 'posto disponibile' : 'posti disponibili'} su ${event.capacity}`}
              </Text>
            </View>
          )}

          {/* Azioni secondarie */}
          {!past && (
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 28 }}>
              <Pressable
                onPress={handleShare}
                style={({ pressed }) => ({
                  flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  backgroundColor: COLORS.bgElev2, borderRadius: 12, paddingVertical: 13,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Ionicons name="share-outline" size={16} color={COLORS.textSecondary} />
                <Text style={{ color: COLORS.textSecondary, fontWeight: '600', fontSize: 14 }}>Condividi</Text>
              </Pressable>
              <Pressable
                onPress={toggleReminder}
                style={({ pressed }) => ({
                  flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  backgroundColor: reminderId ? COLORS.brandSubtle : COLORS.bgElev2,
                  borderRadius: 12, paddingVertical: 13,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Ionicons name={reminderId ? 'notifications' : 'notifications-outline'} size={16} color={reminderId ? COLORS.brand : COLORS.textSecondary} />
                <Text style={{ color: reminderId ? COLORS.brand : COLORS.textSecondary, fontWeight: '600', fontSize: 14 }}>
                  {reminderId ? 'Promemoria attivo' : 'Ricordamelo'}
                </Text>
              </Pressable>
            </View>
          )}

          {/* Descrizione */}
          {event.description ? (
            <View style={{ marginBottom: 28 }}>
              <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 18, letterSpacing: -0.3, marginBottom: 10 }}>
                Descrizione
              </Text>
              <Text style={{ color: COLORS.textSecondary, fontSize: 14, lineHeight: 22 }}>{event.description}</Text>
            </View>
          ) : null}

          {/* Locale */}
          {event.venues?.id && (
            <View style={{ marginBottom: 28 }}>
              <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 18, letterSpacing: -0.3, marginBottom: 10 }}>
                Il locale
              </Text>
              <Pressable
                onPress={() => router.push(`/venue/${event.venues.id}`)}
                style={({ pressed }) => ({
                  backgroundColor: COLORS.bgElev2, borderRadius: 14, padding: 16,
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.textPrimary, fontWeight: '700', fontSize: 15, marginBottom: 2 }}>{event.venues.name}</Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>
                    {event.venues.category} · {event.venues.zona}, {event.venues.city}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
              </Pressable>
              <Pressable
                onPress={handleMaps}
                style={({ pressed }) => ({
                  backgroundColor: COLORS.bgElev2, borderRadius: 14, padding: 16, marginTop: 8,
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Ionicons name="navigate-outline" size={18} color={COLORS.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.textPrimary, fontWeight: '600', fontSize: 14 }}>Apri in Maps</Text>
                  <Text numberOfLines={1} style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                    {event.venues.address || `${event.venues.zona}, ${event.venues.city}`}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
              </Pressable>
            </View>
          )}

          {/* Altri eventi del locale */}
          {otherEvents.length > 0 && (
            <View>
              <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 18, letterSpacing: -0.3, marginBottom: 10 }}>
                Altri eventi a {event.venues?.name}
              </Text>
              <View style={{ gap: 8 }}>
                {otherEvents.map(ev => (
                  <Pressable
                    key={ev.id}
                    onPress={() => router.push(`/event/${ev.id}`)}
                    style={({ pressed }) => ({
                      backgroundColor: COLORS.bgElev2, borderRadius: 14, padding: 14,
                      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text numberOfLines={1} style={{ color: COLORS.textPrimary, fontWeight: '600', fontSize: 14 }}>{ev.title}</Text>
                      <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 3 }}>
                        {formatDate(ev.event_date)} · {formatTime(ev.event_time)}
                      </Text>
                    </View>
                    <Text style={{ color: COLORS.textPrimary, fontWeight: '700', fontSize: 13 }}>{getPriceLabel(ev.price)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Barra prenotazione fissa */}
      <View style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        backgroundColor: COLORS.bg,
        borderTopWidth: 1, borderTopColor: COLORS.borderSubtle,
        paddingHorizontal: 20, paddingTop: 14, paddingBottom: 34,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <View>
          <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 2 }}>
            Prezzo
          </Text>
          <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 22, letterSpacing: -0.4 }}>
            {getPriceLabel(event.price)}
          </Text>
        </View>
        {past ? (
          <View style={{ backgroundColor: COLORS.bgElev2, borderRadius: 12, paddingHorizontal: 26, paddingVertical: 14 }}>
            <Text style={{ color: COLORS.textMuted, fontWeight: '700', fontSize: 15 }}>Evento passato</Text>
          </View>
        ) : (
          <Pressable
            onPress={handleBook}
            style={({ pressed }) => ({
              backgroundColor: COLORS.brandStrong, borderRadius: 12,
              paddingHorizontal: 34, paddingVertical: 14,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Prenota</Text>
          </Pressable>
        )}
      </View>

      <BookingModal
        visible={bookingVisible}
        onClose={() => setBookingVisible(false)}
        event={event}
        session={session}
      />
    </View>
  );
}
