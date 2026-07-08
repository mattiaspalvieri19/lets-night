import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert, Linking, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { COLORS, FONT_FAMILY, formatTime } from '@lets-night/shared';
import { useI18n } from '../../lib/i18n';
import EventCard from '../../components/EventCard';

export default function VenueDetailScreen() {
  const { t, tLabel, fmtDate, fmtPrice } = useI18n();
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [venue, setVenue] = useState(null);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [pastEvents, setPastEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [myId, setMyId] = useState(null);
  const [isFav, setIsFav] = useState(false);
  const [favBusy, setFavBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      const { data: venueData, error } = await supabase
        .from('venues')
        .select('*')
        .eq('id', id)
        .single();

      if (!mounted) return;
      if (error || !venueData) { setNotFound(true); setLoading(false); return; }
      setVenue(venueData);

      const today = new Date().toISOString().split('T')[0];

      const [{ data: upcoming }, { data: past }] = await Promise.all([
        supabase
          .from('events')
          .select('*, venues(name, zona, city, cover_image)')
          .eq('venue_id', id)
          .eq('is_active', true)
          .gte('event_date', today)
          .order('event_date', { ascending: true })
          .limit(10),
        supabase
          .from('events')
          .select('*, venues(name, zona, city)')
          .eq('venue_id', id)
          .eq('is_active', true)
          .lt('event_date', today)
          .order('event_date', { ascending: false })
          .limit(6),
      ]);

      if (!mounted) return;
      setUpcomingEvents(upcoming || []);
      setPastEvents(past || []);

      // Carica stato favorite
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id || null;
      if (!mounted) return;
      setMyId(uid);
      if (uid) {
        const { data: fav } = await supabase
          .from('favorite_venues')
          .select('venue_id')
          .eq('user_id', uid).eq('venue_id', id).maybeSingle();
        if (mounted) setIsFav(!!fav);
      }

      setLoading(false);
    }
    load();
    return () => { mounted = false; };
  }, [id]);

  async function toggleFavorite() {
    if (!myId) { router.push('/auth/login'); return; }
    setFavBusy(true);
    if (isFav) {
      const { error } = await supabase.from('favorite_venues')
        .delete().eq('user_id', myId).eq('venue_id', id);
      if (!error) setIsFav(false);
      else Alert.alert(t('common.error'), t('venueDetail.favError'));
    } else {
      const { error } = await supabase.from('favorite_venues')
        .insert({ user_id: myId, venue_id: id });
      if (!error) setIsFav(true);
      else Alert.alert(t('common.error'), t('venueDetail.favError'));
    }
    setFavBusy(false);
  }

  function handleMaps() {
    if (!venue) return;
    const query = encodeURIComponent(venue.address || `${venue.name}, ${venue.city}`);
    Alert.alert(
      t('eventDetail.openWith'),
      null,
      [
        { text: 'Apple Maps', onPress: () => Linking.openURL(`maps:?q=${query}`) },
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

  function handlePhone() {
    if (venue?.phone) Linking.openURL(`tel:${venue.phone}`);
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={COLORS.brand} size="large" />
      </View>
    );
  }

  if (notFound || !venue) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
        <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 20, marginBottom: 8 }}>{t('venueDetail.notFoundTitle')}</Text>
        <Text style={{ color: COLORS.textMuted, textAlign: 'center' }}>{t('venueDetail.notFoundBody')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      {/* Hero compatto: foto solo se il locale l'ha caricata */}
      <View style={{ height: 190, backgroundColor: COLORS.bgElev1, justifyContent: 'flex-end', padding: 20, overflow: 'hidden' }}>
        {venue.cover_image ? (
          <>
            <Image source={{ uri: venue.cover_image }} resizeMode="cover" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' }} />
          </>
        ) : (
          <Text
            numberOfLines={1}
            style={{
              position: 'absolute', bottom: -16, left: -6,
              fontFamily: FONT_FAMILY.displayHeavy,
              fontSize: 92, letterSpacing: -3,
              color: COLORS.brand, opacity: 0.1,
            }}
          >
            {(tLabel(venue.category) || 'Night').toUpperCase()}
          </Text>
        )}

        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          {venue.is_partner && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6 }}>
              <Ionicons name="star" size={10} color={COLORS.brand} />
              <Text style={{ color: COLORS.brand, fontSize: 10, fontWeight: '700', letterSpacing: 0.8 }}>PARTNER</Text>
            </View>
          )}
          {venue.is_verified && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6 }}>
              <Ionicons name="checkmark-circle" size={11} color={COLORS.success} />
              <Text style={{ color: COLORS.success, fontSize: 10, fontWeight: '700', letterSpacing: 0.8 }}>VERIFICATO</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: FONT_FAMILY.displayHeavy, color: '#fff', fontSize: 27, lineHeight: 31, letterSpacing: -0.6 }}>{venue.name}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 4 }}>{venue.zona}, {venue.city}</Text>
          </View>
          <Pressable
            onPress={toggleFavorite}
            disabled={favBusy}
            hitSlop={8}
            style={({ pressed }) => ({
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: 'rgba(0,0,0,0.55)',
              alignItems: 'center', justifyContent: 'center',
              opacity: favBusy || pressed ? 0.7 : 1,
            })}
          >
            {favBusy
              ? <ActivityIndicator color={isFav ? COLORS.danger : '#fff'} size="small" />
              : <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={20} color={isFav ? COLORS.danger : '#fff'} />
            }
          </Pressable>
        </View>
      </View>

      <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 100 }}>
        {/* Info */}
        <View style={{ backgroundColor: COLORS.bgElev2, borderRadius: 14, padding: 18, marginBottom: 16 }}>
          {venue.category && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
              <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>{t('venueDetail.type')}</Text>
              <Text style={{ color: COLORS.textPrimary, fontWeight: '600' }}>{tLabel(venue.category)}</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: venue.phone ? 14 : 0 }}>
            <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>{t('venueDetail.zone')}</Text>
            <Text style={{ color: COLORS.textPrimary, fontWeight: '600' }}>{venue.zona}, {venue.city}</Text>
          </View>
          {venue.phone && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>{t('venueDetail.phone')}</Text>
              <Pressable onPress={handlePhone}>
                <Text style={{ color: COLORS.brand, fontWeight: '600' }}>{venue.phone}</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Azioni */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 26 }}>
          <Pressable
            onPress={handleMaps}
            style={({ pressed }) => ({
              flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              backgroundColor: COLORS.bgElev2, borderRadius: 12, paddingVertical: 13,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Ionicons name="navigate-outline" size={16} color={COLORS.textSecondary} />
            <Text style={{ color: COLORS.textSecondary, fontWeight: '600', fontSize: 14 }}>{t('eventDetail.openMaps')}</Text>
          </Pressable>
          {venue.phone && (
            <Pressable
              onPress={handlePhone}
              style={({ pressed }) => ({
                flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                backgroundColor: COLORS.bgElev2, borderRadius: 12, paddingVertical: 13,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Ionicons name="call-outline" size={16} color={COLORS.textSecondary} />
              <Text style={{ color: COLORS.textSecondary, fontWeight: '600', fontSize: 14 }}>{t('venueDetail.call')}</Text>
            </Pressable>
          )}
        </View>

        {/* Descrizione */}
        {venue.description ? (
          <View style={{ marginBottom: 26 }}>
            <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 18, letterSpacing: -0.3, marginBottom: 8 }}>{t('venueDetail.info')}</Text>
            <Text style={{ color: COLORS.textSecondary, fontSize: 14, lineHeight: 22 }}>{venue.description}</Text>
          </View>
        ) : null}

        {/* Prossimi eventi */}
        {upcomingEvents.length > 0 && (
          <View style={{ marginBottom: 26 }}>
            <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 18, letterSpacing: -0.3, marginBottom: 12 }}>
              {t('venueDetail.upcomingEvents', { count: upcomingEvents.length })}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {upcomingEvents.map(ev => (
                <View key={ev.id} style={{ width: '48%' }}>
                  <EventCard event={ev} onPress={() => router.push(`/event/${ev.id}`)} />
                </View>
              ))}
            </View>
          </View>
        )}

        {upcomingEvents.length === 0 && (
          <View style={{ backgroundColor: COLORS.bgElev2, borderRadius: 14, padding: 24, alignItems: 'center', marginBottom: 26 }}>
            <Ionicons name="calendar-outline" size={26} color={COLORS.textMuted} style={{ marginBottom: 10 }} />
            <Text style={{ color: COLORS.textPrimary, fontWeight: '700', marginBottom: 4 }}>{t('venueDetail.emptyEventsTitle')}</Text>
            <Text style={{ color: COLORS.textMuted, textAlign: 'center', fontSize: 13 }}>{t('venueDetail.emptyEventsBody')}</Text>
          </View>
        )}

        {/* Ultimi eventi */}
        {pastEvents.length > 0 && (
          <View>
            <Pressable
              onPress={() => setShowPast(!showPast)}
              style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}
            >
              <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 18, letterSpacing: -0.3 }}>
                {t('venueDetail.pastEvents', { count: pastEvents.length })}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>{showPast ? t('venueDetail.hide') : t('venueDetail.show')}</Text>
                <Ionicons name={showPast ? 'chevron-up' : 'chevron-down'} size={14} color={COLORS.textMuted} />
              </View>
            </Pressable>
            {showPast && (
              <View style={{ gap: 8 }}>
                {pastEvents.map(ev => (
                  <Pressable
                    key={ev.id}
                    onPress={() => router.push(`/event/${ev.id}`)}
                    style={({ pressed }) => ({
                      backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 14,
                      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                      opacity: pressed ? 0.85 : 0.75,
                    })}
                  >
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text style={{ color: COLORS.textPrimary, fontWeight: '600' }} numberOfLines={1}>{ev.title}</Text>
                      <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 3 }}>
                        {fmtDate(ev.event_date)} · {formatTime(ev.event_time)}
                      </Text>
                    </View>
                    <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>{fmtPrice(ev.price)}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
