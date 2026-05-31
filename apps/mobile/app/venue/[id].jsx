import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { COLORS_BY_CAT, formatDate, formatTime, getPriceLabel } from '@lets-night/shared';
import EventCard from '../../components/EventCard';

export default function VenueDetailScreen() {
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
          .select('*, venues(name, zona, city)')
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
      await supabase.from('favorite_venues').delete().eq('user_id', myId).eq('venue_id', id);
      setIsFav(false);
    } else {
      await supabase.from('favorite_venues').insert({ user_id: myId, venue_id: id });
      setIsFav(true);
    }
    setFavBusy(false);
  }

  function handleMaps() {
    if (!venue) return;
    const query = encodeURIComponent(venue.address || `${venue.name}, ${venue.city}`);
    Alert.alert(
      'Apri con',
      null,
      [
        { text: 'Apple Maps', onPress: () => Linking.openURL(`maps:?q=${query}`) },
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

  function handlePhone() {
    if (venue?.phone) Linking.openURL(`tel:${venue.phone}`);
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0a0f', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#A855F7" size="large" />
      </View>
    );
  }

  if (notFound || !venue) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0a0f', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 8 }}>Locale non trovato</Text>
        <Text style={{ color: '#64748B', textAlign: 'center' }}>Questo locale non esiste o è stato rimosso.</Text>
      </View>
    );
  }

  const heroColors = ['#1a0533', '#0d0d1a'];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#0a0a0f' }}>
      {/* Hero */}
      <View style={{ height: 180, backgroundColor: heroColors[0], justifyContent: 'flex-end', padding: 20 }}>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(124,58,237,0.08)' }} />
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          {venue.is_partner && (
            <View style={{ backgroundColor: 'rgba(124,58,237,0.3)', borderWidth: 1, borderColor: 'rgba(168,85,247,0.5)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
              <Text style={{ color: '#A855F7', fontSize: 11, fontWeight: '700' }}>★ PARTNER</Text>
            </View>
          )}
          {venue.is_verified && (
            <View style={{ backgroundColor: 'rgba(34,197,94,0.15)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.4)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
              <Text style={{ color: '#4ADE80', fontSize: 11, fontWeight: '700' }}>✓ VERIFICATO</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900', lineHeight: 30 }}>{venue.name}</Text>
            <Text style={{ color: '#A855F7', fontSize: 13, marginTop: 4 }}>{venue.zona}, {venue.city}</Text>
          </View>
          <Pressable
            onPress={toggleFavorite}
            disabled={favBusy}
            hitSlop={8}
            style={({ pressed }) => ({
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: isFav ? 'rgba(239,68,68,0.18)' : 'rgba(255,255,255,0.08)',
              borderWidth: 1.5,
              borderColor: isFav ? '#EF4444' : 'rgba(255,255,255,0.18)',
              alignItems: 'center', justifyContent: 'center',
              opacity: favBusy || pressed ? 0.7 : 1,
            })}
          >
            {favBusy
              ? <ActivityIndicator color={isFav ? '#EF4444' : '#fff'} size="small" />
              : <Text style={{ fontSize: 20 }}>{isFav ? '❤️' : '🤍'}</Text>
            }
          </Pressable>
        </View>
      </View>

      <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 100 }}>
        {/* Info */}
        <View style={{ backgroundColor: '#18181f', borderRadius: 16, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(168,85,247,0.12)' }}>
          {venue.category && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
              <Text style={{ color: '#64748B', fontSize: 13 }}>Tipo</Text>
              <Text style={{ color: '#fff', fontWeight: '600' }}>{venue.category}</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: venue.phone ? 14 : 0 }}>
            <Text style={{ color: '#64748B', fontSize: 13 }}>Zona</Text>
            <Text style={{ color: '#fff', fontWeight: '600' }}>{venue.zona}, {venue.city}</Text>
          </View>
          {venue.phone && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: '#64748B', fontSize: 13 }}>Telefono</Text>
              <Pressable onPress={handlePhone}>
                <Text style={{ color: '#A855F7', fontWeight: '600' }}>{venue.phone}</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Azioni */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
          <Pressable
            onPress={handleMaps}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#18181f', borderRadius: 12, paddingVertical: 13, borderWidth: 1, borderColor: 'rgba(168,85,247,0.2)' }}
          >
            <Text style={{ fontSize: 18 }}>📍</Text>
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>Apri in Maps</Text>
          </Pressable>
          {venue.phone && (
            <Pressable
              onPress={handlePhone}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#18181f', borderRadius: 12, paddingVertical: 13, borderWidth: 1, borderColor: 'rgba(168,85,247,0.2)' }}
            >
              <Text style={{ fontSize: 18 }}>📞</Text>
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>Chiama</Text>
            </Pressable>
          )}
        </View>

        {/* Descrizione */}
        {venue.description ? (
          <View style={{ marginBottom: 24 }}>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 8 }}>Info</Text>
            <Text style={{ color: '#9CA3AF', lineHeight: 22 }}>{venue.description}</Text>
          </View>
        ) : null}

        {/* Prossimi eventi */}
        {upcomingEvents.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 14 }}>
              Prossimi eventi ({upcomingEvents.length})
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
          <View style={{ backgroundColor: '#18181f', borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 24, borderWidth: 1, borderColor: 'rgba(168,85,247,0.1)' }}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>🎉</Text>
            <Text style={{ color: '#fff', fontWeight: '700', marginBottom: 4 }}>Nessun evento in programma</Text>
            <Text style={{ color: '#64748B', textAlign: 'center', fontSize: 13 }}>Al momento non ci sono eventi programmati per questo locale.</Text>
          </View>
        )}

        {/* Ultimi eventi */}
        {pastEvents.length > 0 && (
          <View>
            <Pressable
              onPress={() => setShowPast(!showPast)}
              style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}
            >
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>
                Ultimi eventi ({pastEvents.length})
              </Text>
              <Text style={{ color: '#A855F7', fontSize: 14 }}>{showPast ? '▲ Nascondi' : '▼ Mostra'}</Text>
            </Pressable>
            {showPast && (
              <View style={{ gap: 10 }}>
                {pastEvents.map(ev => (
                  <Pressable
                    key={ev.id}
                    onPress={() => router.push(`/event/${ev.id}`)}
                    style={{ backgroundColor: '#18181f', borderRadius: 12, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(168,85,247,0.08)', opacity: 0.7 }}
                  >
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text style={{ color: '#fff', fontWeight: '600' }} numberOfLines={1}>{ev.title}</Text>
                      <Text style={{ color: '#64748B', fontSize: 12, marginTop: 3 }}>
                        {formatDate(ev.event_date)} · {formatTime(ev.event_time)}
                      </Text>
                    </View>
                    <Text style={{ color: '#64748B', fontSize: 13 }}>{getPriceLabel(ev.price)}</Text>
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
