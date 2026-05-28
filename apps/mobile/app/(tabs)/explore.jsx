import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, FlatList, Pressable, TextInput,
  Modal, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import {
  CATS_NO_TUTTI, CITIES, COLORS_BY_CAT,
  formatDate, formatTime, getPriceLabel, isInDateRange,
} from '@lets-night/shared';
import EventCard from '../../components/EventCard';

const DATE_RANGES = [
  { id: 'all', label: 'Tutte le date' },
  { id: 'today', label: 'Oggi' },
  { id: 'week', label: 'Questa settimana' },
  { id: 'month', label: 'Questo mese' },
];

const SORT_OPTIONS = [
  { id: 'date_asc', label: 'Prima i prossimi' },
  { id: 'date_desc', label: 'Prima i lontani' },
  { id: 'price_asc', label: 'Prezzo ↑' },
  { id: 'price_desc', label: 'Prezzo ↓' },
];

export default function ExploreScreen() {
  const router = useRouter();
  const [events, setEvents] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [search, setSearch] = useState('');
  const [selectedCities, setSelectedCities] = useState(['Milano', 'Roma']);
  const [selectedCats, setSelectedCats] = useState([]);
  const [selectedZone, setSelectedZone] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [priceMax, setPriceMax] = useState(200);
  const [sortBy, setSortBy] = useState('date_asc');

  // Pending state inside the modal — committed on "Applica"
  const [pendingCities, setPendingCities] = useState(['Milano', 'Roma']);
  const [pendingCats, setPendingCats] = useState([]);
  const [pendingZone, setPendingZone] = useState('all');
  const [pendingDateRange, setPendingDateRange] = useState('all');
  const [pendingPriceMax, setPendingPriceMax] = useState(200);

  async function loadData() {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('events')
      .select('*, venues(name, zona, city, is_partner)')
      .eq('is_active', true)
      .gte('event_date', today);
    const list = data || [];
    setEvents(list);
    const zonesSet = new Set(list.map(e => e.venues?.zona).filter(Boolean));
    setZones(['all', ...Array.from(zonesSet).sort()]);
  }

  useEffect(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, []);

  function openFilters() {
    setPendingCities(selectedCities);
    setPendingCats(selectedCats);
    setPendingZone(selectedZone);
    setPendingDateRange(dateRange);
    setPendingPriceMax(priceMax);
    setFiltersOpen(true);
  }

  function applyFilters() {
    setSelectedCities(pendingCities);
    setSelectedCats(pendingCats);
    setSelectedZone(pendingZone);
    setDateRange(pendingDateRange);
    setPriceMax(pendingPriceMax);
    setFiltersOpen(false);
  }

  function resetFilters() {
    setSearch('');
    setSelectedCities(['Milano', 'Roma']);
    setSelectedCats([]);
    setSelectedZone('all');
    setDateRange('all');
    setPriceMax(200);
    setSortBy('date_asc');
    setPendingCities(['Milano', 'Roma']);
    setPendingCats([]);
    setPendingZone('all');
    setPendingDateRange('all');
    setPendingPriceMax(200);
  }

  const filtered = events.filter(e => {
    if (!selectedCities.includes(e.venues?.city)) return false;
    if (selectedCats.length > 0 && !selectedCats.includes(e.category)) return false;
    if (selectedZone !== 'all' && e.venues?.zona !== selectedZone) return false;
    if (!isInDateRange(e.event_date, dateRange)) return false;
    const price = e.price == null ? null : parseFloat(e.price);
    if (priceMax === 0 && (price == null || price > 0)) return false;
    if (price != null && price > priceMax) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !e.title.toLowerCase().includes(q) &&
        !(e.venues?.name || '').toLowerCase().includes(q) &&
        !(e.venues?.zona || '').toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'date_asc') return new Date(a.event_date) - new Date(b.event_date);
    if (sortBy === 'date_desc') return new Date(b.event_date) - new Date(a.event_date);
    if (sortBy === 'price_asc') return (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0);
    if (sortBy === 'price_desc') return (parseFloat(b.price) || 0) - (parseFloat(a.price) || 0);
    return 0;
  });

  const activeFiltersCount =
    (selectedCities.length < 2 ? 1 : 0) +
    selectedCats.length +
    (selectedZone !== 'all' ? 1 : 0) +
    (dateRange !== 'all' ? 1 : 0) +
    (priceMax < 200 ? 1 : 0);

  return (
    <View style={{ flex: 1, backgroundColor: '#0a0a0f' }}>
      {/* Header */}
      <View style={{ paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16, backgroundColor: '#0a0a0f' }}>
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900', marginBottom: 12 }}>
          Esplora
        </Text>

        {/* Search */}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#18181f', borderRadius: 12, paddingHorizontal: 14, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(168,85,247,0.15)' }}>
          <Text style={{ color: '#64748B', fontSize: 16, marginRight: 8 }}>🔍</Text>
          <TextInput
            placeholder="Cerca evento, locale o zona..."
            placeholderTextColor="#4B5563"
            value={search}
            onChangeText={setSearch}
            style={{ flex: 1, color: '#fff', paddingVertical: 12, fontSize: 14 }}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Text style={{ color: '#64748B', fontSize: 18 }}>×</Text>
            </Pressable>
          )}
        </View>

        {/* Sort + Filters row */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
            {SORT_OPTIONS.map(opt => (
              <Pressable
                key={opt.id}
                onPress={() => setSortBy(opt.id)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 20,
                  marginRight: 8,
                  backgroundColor: sortBy === opt.id ? '#7C3AED' : '#18181f',
                  borderWidth: 1,
                  borderColor: sortBy === opt.id ? '#7C3AED' : 'rgba(168,85,247,0.2)',
                }}
              >
                <Text style={{ color: sortBy === opt.id ? '#fff' : '#9CA3AF', fontSize: 13, fontWeight: sortBy === opt.id ? '700' : '400' }}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable
            onPress={openFilters}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: activeFiltersCount > 0 ? '#7C3AED' : 'rgba(168,85,247,0.2)',
              backgroundColor: activeFiltersCount > 0 ? 'rgba(124,58,237,0.15)' : '#18181f',
            }}
          >
            <Text style={{ fontSize: 14 }}>⚙️</Text>
            {activeFiltersCount > 0 && (
              <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{activeFiltersCount}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      {/* Results count */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
        <Text style={{ color: '#64748B', fontSize: 13 }}>
          {loading ? 'Caricamento...' : `${sorted.length} ${sorted.length === 1 ? 'evento' : 'eventi'}`}
        </Text>
      </View>

      {/* Results */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#A855F7" size="large" />
        </View>
      ) : sorted.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>🔍</Text>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 8, textAlign: 'center' }}>Nessun evento trovato</Text>
          <Text style={{ color: '#64748B', textAlign: 'center', lineHeight: 20, marginBottom: 20 }}>
            Prova a modificare i filtri o resettarli.
          </Text>
          <Pressable
            onPress={resetFilters}
            style={{ backgroundColor: '#7C3AED', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Reset filtri</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={item => item.id}
          numColumns={2}
          contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 100 }}
          columnWrapperStyle={{ gap: 10, marginBottom: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#A855F7" />}
          renderItem={({ item }) => (
            <View style={{ flex: 1 }}>
              <EventCard event={item} onPress={() => router.push(`/event/${item.id}`)} />
            </View>
          )}
        />
      )}

      {/* Filter Modal */}
      <Modal visible={filtersOpen} transparent animationType="slide" onRequestClose={() => setFiltersOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' }}
            onPress={() => setFiltersOpen(false)}
          />
          <View style={{ backgroundColor: '#111118', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, borderTopWidth: 1, borderColor: 'rgba(168,85,247,0.2)', maxHeight: '88%' }}>
            {/* Handle */}
            <View style={{ width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />

            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>Filtri</Text>
              <Pressable onPress={() => {
                setPendingCities(['Milano', 'Roma']);
                setPendingCats([]);
                setPendingZone('all');
                setPendingDateRange('all');
                setPendingPriceMax(200);
              }}>
                <Text style={{ color: '#A855F7', fontSize: 14, fontWeight: '600' }}>Reset</Text>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Città */}
              <Text style={{ color: '#64748B', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>Città</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                {CITIES.map(c => {
                  const active = pendingCities.includes(c);
                  return (
                    <Pressable
                      key={c}
                      onPress={() => setPendingCities(active ? pendingCities.filter(x => x !== c) : [...pendingCities, c])}
                      style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: active ? '#7C3AED' : '#18181f', borderWidth: 1, borderColor: active ? '#7C3AED' : 'rgba(168,85,247,0.2)' }}
                    >
                      <Text style={{ color: active ? '#fff' : '#9CA3AF', fontWeight: active ? '700' : '400' }}>{c}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Categoria */}
              <Text style={{ color: '#64748B', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>Categoria</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                {CATS_NO_TUTTI.map(c => {
                  const active = pendingCats.includes(c);
                  return (
                    <Pressable
                      key={c}
                      onPress={() => setPendingCats(active ? pendingCats.filter(x => x !== c) : [...pendingCats, c])}
                      style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: active ? '#7C3AED' : '#18181f', borderWidth: 1, borderColor: active ? '#7C3AED' : 'rgba(168,85,247,0.2)' }}
                    >
                      <Text style={{ color: active ? '#fff' : '#9CA3AF', fontSize: 13, fontWeight: active ? '700' : '400' }}>{c}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Quando */}
              <Text style={{ color: '#64748B', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>Quando</Text>
              <View style={{ gap: 8, marginBottom: 20 }}>
                {DATE_RANGES.map(d => {
                  const active = pendingDateRange === d.id;
                  return (
                    <Pressable
                      key={d.id}
                      onPress={() => setPendingDateRange(d.id)}
                      style={{ paddingHorizontal: 16, paddingVertical: 11, borderRadius: 10, backgroundColor: active ? 'rgba(124,58,237,0.2)' : '#18181f', borderWidth: 1, borderColor: active ? '#7C3AED' : 'rgba(168,85,247,0.15)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                    >
                      <Text style={{ color: active ? '#fff' : '#9CA3AF', fontWeight: active ? '700' : '400' }}>{d.label}</Text>
                      {active && <Text style={{ color: '#A855F7' }}>✓</Text>}
                    </Pressable>
                  );
                })}
              </View>

              {/* Prezzo massimo */}
              <Text style={{ color: '#64748B', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>
                Prezzo massimo: {pendingPriceMax >= 200 ? 'Qualsiasi' : `EUR ${pendingPriceMax}`}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
                {[0, 10, 20, 30, 50, 100, 200].map(v => {
                  const active = pendingPriceMax === v;
                  return (
                    <Pressable
                      key={v}
                      onPress={() => setPendingPriceMax(v)}
                      style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: active ? '#7C3AED' : '#18181f', borderWidth: 1, borderColor: active ? '#7C3AED' : 'rgba(168,85,247,0.2)' }}
                    >
                      <Text style={{ color: active ? '#fff' : '#9CA3AF', fontSize: 13, fontWeight: active ? '700' : '400' }}>
                        {v === 0 ? 'Gratis' : v === 200 ? 'Tutto' : `EUR ${v}`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Zona */}
              {zones.length > 1 && (
                <>
                  <Text style={{ color: '#64748B', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>Zona</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                    {zones.map(z => {
                      const active = pendingZone === z;
                      return (
                        <Pressable
                          key={z}
                          onPress={() => setPendingZone(z)}
                          style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: active ? '#7C3AED' : '#18181f', borderWidth: 1, borderColor: active ? '#7C3AED' : 'rgba(168,85,247,0.2)' }}
                        >
                          <Text style={{ color: active ? '#fff' : '#9CA3AF', fontSize: 13, fontWeight: active ? '700' : '400' }}>
                            {z === 'all' ? 'Tutte le zone' : z}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}
            </ScrollView>

            <Pressable
              onPress={applyFilters}
              style={{ backgroundColor: '#7C3AED', paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginTop: 8 }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Applica filtri</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
