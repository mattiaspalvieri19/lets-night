import { useEffect, useState } from 'react';
import { ScrollView, View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { CATS, CITIES } from '@lets-night/shared';
import EventCard from '../../components/EventCard';
import FeaturedCard from '../../components/FeaturedCard';

export default function HomeScreen() {
  const [city, setCity] = useState('Milano');
  const [cat, setCat] = useState('Tutti');
  const [search, setSearch] = useState('');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadEvents() {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('events')
        .select('*, venues(name, zona, city, is_partner)')
        .eq('is_active', true)
        .gte('event_date', today)
        .order('event_date', { ascending: true });
      if (error) console.error('Errore caricamento eventi:', error);
      else setEvents(data || []);
      setLoading(false);
    }
    loadEvents();
  }, []);

  const filtered = events.filter(e => {
    if (e.venues?.city !== city) return false;
    if (cat !== 'Tutti' && e.category !== cat) return false;
    if (search && !e.title.toLowerCase().includes(search.toLowerCase()) && !(e.venues?.name || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const scoreA = (a.is_sponsored ? 100 : 0) + ((a.source === 'partner' || a.source === 'manual') ? 50 : 0);
    const scoreB = (b.is_sponsored ? 100 : 0) + ((b.source === 'partner' || b.source === 'manual') ? 50 : 0);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return new Date(a.event_date) - new Date(b.event_date);
  });

  const featured = sorted.find(e => e.is_sponsored);
  const grid = sorted.filter(e => e.id !== featured?.id);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#09090f', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#A855F7" size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#09090f' }} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 4 }}>
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: -0.5 }}>
          {"Let's"}<Text style={{ color: '#A855F7' }}>{"Night"}</Text>
        </Text>
        <Text style={{ color: '#64748B', marginTop: 4, fontSize: 14 }}>Cosa fai stasera?</Text>
      </View>

      {/* City toggle */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 20, marginTop: 16, marginBottom: 14, gap: 8 }}>
        {CITIES.map(c => (
          <Pressable
            key={c}
            onPress={() => setCity(c)}
            style={{
              paddingHorizontal: 18,
              paddingVertical: 8,
              borderRadius: 20,
              borderWidth: 1.5,
              borderColor: city === c ? '#7C3AED' : 'rgba(255,255,255,0.1)',
              backgroundColor: city === c ? '#7C3AED' : 'transparent',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: city === c ? '700' : '400', fontSize: 13 }}>{c}</Text>
          </Pressable>
        ))}
      </View>

      {/* Search bar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 14, backgroundColor: '#111118', borderWidth: 1, borderColor: 'rgba(168,85,247,0.2)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, gap: 10 }}>
        <Text style={{ color: '#64748B', fontSize: 16 }}>🔍</Text>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Cerca evento, locale, zona..."
          placeholderTextColor="#64748B"
          style={{ flex: 1, color: '#fff', fontSize: 14 }}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <Text style={{ color: '#64748B', fontSize: 20, lineHeight: 22 }}>×</Text>
          </Pressable>
        )}
      </View>

      {/* Category filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingBottom: 4 }}>
        {CATS.map(c => (
          <Pressable
            key={c}
            onPress={() => setCat(c)}
            style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: cat === c ? 'transparent' : 'rgba(168,85,247,0.2)', backgroundColor: cat === c ? '#7C3AED' : 'transparent' }}
          >
            <Text style={{ color: cat === c ? '#fff' : '#64748B', fontWeight: cat === c ? '700' : '500', fontSize: 13 }}>{c}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Section title */}
      <View style={{ paddingHorizontal: 20, marginTop: 24, marginBottom: 16 }}>
        <Text style={{ color: '#A855F7', fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 5 }}>
          Stasera a {city}
        </Text>
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: -0.5 }}>
          {'Trova il tuo '}
          <Text style={{ color: '#A855F7' }}>momento</Text>
        </Text>
      </View>

      {sorted.length === 0 ? (
        <View style={{ paddingVertical: 48, paddingHorizontal: 20, alignItems: 'center' }}>
          <Text style={{ color: '#64748B', textAlign: 'center', fontSize: 14, lineHeight: 22 }}>
            Nessun evento trovato.{'\n'}Prova a cambiare filtro o città.
          </Text>
        </View>
      ) : (
        <>
          {/* Featured card */}
          {featured && (
            <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
              <FeaturedCard event={featured} onPress={() => router.push(`/event/${featured.id}`)} />
            </View>
          )}

          {/* Grid subtitle */}
          {grid.length > 0 && (
            <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
              <Text style={{ color: '#64748B', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' }}>
                {featured ? 'Altri eventi' : 'Tutti gli eventi'}
              </Text>
            </View>
          )}

          {/* 2-column grid */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, gap: 12 }}>
            {grid.map(item => (
              <View key={item.id} style={{ width: '48%' }}>
                <EventCard event={item} onPress={() => router.push(`/event/${item.id}`)} />
              </View>
            ))}
            {grid.length % 2 !== 0 && <View style={{ width: '48%' }} />}
          </View>
        </>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}
