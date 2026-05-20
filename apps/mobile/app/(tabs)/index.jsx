import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { CATS, CITIES, COLORS_BY_CAT, formatDate, formatTime } from '@lets-night/shared';

export default function HomeScreen() {
  const [city, setCity] = useState('Milano');
  const [cat, setCat] = useState('Tutti');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadEvents() {
      setLoading(true);
      const { data, error } = await supabase
        .from('events')
        .select('*, venues(name, zona, city, is_partner)')
        .eq('is_active', true)
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
    return true;
  });

  return (
    <ScrollView className="flex-1 bg-dark">
      {/* Header */}
      <View className="px-5 pt-6 pb-4">
        <Text className="text-white text-3xl font-bold">
          Let&apos;s<Text className="text-brand">Night</Text>
        </Text>
        <Text className="text-gray-400 mt-1">Cosa fai stasera?</Text>
      </View>

      {/* City toggle */}
      <View className="flex-row px-5 mb-4 gap-2">
        {CITIES.map(c => (
          <Pressable
            key={c}
            onPress={() => setCity(c)}
            className={`px-4 py-2 rounded-full border ${city === c ? 'bg-brand border-brand' : 'border-gray-700'}`}
          >
            <Text className={city === c ? 'text-white font-semibold' : 'text-gray-400'}>{c}</Text>
          </Pressable>
        ))}
      </View>

      {/* Category filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-5 mb-5">
        {CATS.map(c => (
          <Pressable
            key={c}
            onPress={() => setCat(c)}
            className={`mr-2 px-4 py-2 rounded-full border ${cat === c ? 'bg-brand border-brand' : 'border-gray-700'}`}
          >
            <Text className={cat === c ? 'text-white font-semibold text-sm' : 'text-gray-400 text-sm'}>{c}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Events list */}
      {loading ? (
        <ActivityIndicator color="#12A0D7" className="mt-10" />
      ) : filtered.length === 0 ? (
        <View className="px-5 mt-10">
          <Text className="text-gray-500 text-center">Nessun evento trovato.</Text>
        </View>
      ) : (
        <View className="px-5 gap-4">
          {filtered.map(ev => {
            const colors = COLORS_BY_CAT[ev.category] || ['#1a0533', '#0d0d1a', '#c084fc'];
            return (
              <Link key={ev.id} href={`/event/${ev.id}`} asChild>
                <Pressable className="bg-card rounded-2xl overflow-hidden">
                  <View style={{ backgroundColor: colors[0], height: 100 }} />
                  <View className="p-4">
                    <Text className="text-gray-400 text-xs mb-1">{ev.venues?.name}</Text>
                    <Text className="text-white font-bold text-lg">{ev.title}</Text>
                    <Text className="text-gray-400 text-sm mt-1">
                      {formatDate(ev.event_date)} · {formatTime(ev.event_time)}
                    </Text>
                    <View className="flex-row justify-between items-center mt-3">
                      <Text className="text-gray-500 text-sm">{ev.venues?.zona}, {ev.venues?.city}</Text>
                      <Text className="text-brand font-semibold">
                        {ev.price > 0 ? `EUR ${ev.price}` : 'Lista'}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              </Link>
            );
          })}
        </View>
      )}
      <View className="h-8" />
    </ScrollView>
  );
}
