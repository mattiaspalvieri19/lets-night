import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { CATS, CITIES, QUICK_TAGS, TIME_SLOTS } from '@lets-night/shared';
import EventCard from '../../components/EventCard';
import FeaturedCard from '../../components/FeaturedCard';
import EmptyState from '../../components/EmptyState';
import AdvancedFiltersModal from '../../components/AdvancedFiltersModal';

const DEFAULT_ADV = {
  cities: ['Milano', 'Roma'],
  zone: 'all',
  cats: [],
  dateRange: 'all',
  timeSlot: null,
  priceMin: 0,
  priceMax: 200,
  entryType: 'any',
  musicTypes: [],
  dressCode: null,
  ageTarget: null,
  tags: [],
  sortBy: 'date_asc',
};

function timeSlotMatch(slot, eventTime) {
  if (!slot || !eventTime) return true;
  const h = parseInt(String(eventTime).slice(0, 2), 10);
  if (isNaN(h)) return true;
  const map = TIME_SLOTS.reduce((acc, t) => ({ ...acc, [t.id]: t.id }), {});
  if (slot === 'aperitivo') return h >= 18 && h < 21;
  if (slot === 'cena')      return h >= 20 && h < 23;
  if (slot === 'serata')    return h >= 22 || h < 2;
  if (slot === 'after')     return h >= 2 && h < 6;
  return true;
}

function dateRangeMatch(range, eventDate) {
  if (range === 'all') return true;
  const ev = new Date(eventDate);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const evD = new Date(ev); evD.setHours(0, 0, 0, 0);
  if (range === 'today') return evD.getTime() === today.getTime();
  if (range === 'week') {
    const end = new Date(today); end.setDate(end.getDate() + 7);
    return evD >= today && evD <= end;
  }
  if (range === 'month') {
    const end = new Date(today); end.setMonth(end.getMonth() + 1);
    return evD >= today && evD <= end;
  }
  return true;
}

export default function HomeScreen() {
  const [city, setCity] = useState('Milano');
  const [cat, setCat] = useState('Tutti');
  const [quickTag, setQuickTag] = useState(null);
  const [search, setSearch] = useState('');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [advOpen, setAdvOpen] = useState(false);
  const [adv, setAdv] = useState(null); // null = nessun filtro avanzato attivo

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

  const zones = useMemo(() => {
    const set = new Set(events.map(e => e.venues?.zona).filter(Boolean));
    return ['all', ...Array.from(set).sort()];
  }, [events]);

  const filtered = useMemo(() => {
    return events.filter(e => {
      // Quick chip "città" sempre attiva
      if (e.venues?.city !== city) return false;
      // Quick chip "categoria"
      if (cat !== 'Tutti' && e.category !== cat) return false;
      // Quick tag (Live Music, Gratis, Tavoli, Guestlist, After dinner)
      if (quickTag) {
        const tags = (e.tags || []).map(t => t.toLowerCase());
        if (quickTag === 'Gratis') {
          if (e.price && e.price > 0) return false;
        } else {
          if (!tags.includes(quickTag.toLowerCase())) return false;
        }
      }
      // Search
      if (search) {
        const q = search.toLowerCase();
        const hay = `${e.title} ${e.venues?.name || ''} ${e.venues?.zona || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      // Filtri avanzati
      if (adv) {
        if (adv.cities && adv.cities.length && !adv.cities.includes(e.venues?.city)) return false;
        if (adv.zone && adv.zone !== 'all' && e.venues?.zona !== adv.zone) return false;
        if (adv.cats && adv.cats.length && !adv.cats.includes(e.category)) return false;
        if (!dateRangeMatch(adv.dateRange, e.event_date)) return false;
        if (!timeSlotMatch(adv.timeSlot, e.event_time)) return false;
        const price = e.price == null ? null : Number(e.price);
        if (adv.entryType === 'free' && !(price === 0 || price == null)) return false;
        if (adv.entryType === 'paid' && !(price > 0)) return false;
        if (adv.entryType === 'guestlist' && !(e.tags || []).map(t => t.toLowerCase()).includes('guestlist')) return false;
        if (adv.entryType === 'table' && !(e.tags || []).map(t => t.toLowerCase()).includes('tavoli')) return false;
        if (price != null) {
          if (adv.priceMin > 0 && price < adv.priceMin) return false;
          if (adv.priceMax > 0 && adv.priceMax < 200 && price > adv.priceMax) return false;
        }
        if (adv.musicTypes && adv.musicTypes.length && !adv.musicTypes.includes(e.music_type)) return false;
        if (adv.dressCode && e.dress_code && e.dress_code !== adv.dressCode) return false;
        if (adv.ageTarget && e.age_target && e.age_target !== adv.ageTarget) return false;
      }
      return true;
    });
  }, [events, city, cat, quickTag, search, adv]);

  const sorted = useMemo(() => {
    const order = adv?.sortBy || 'date_asc';
    const list = [...filtered];
    list.sort((a, b) => {
      const scoreA = (a.is_sponsored ? 100 : 0) + ((a.source === 'partner' || a.source === 'manual') ? 50 : 0);
      const scoreB = (b.is_sponsored ? 100 : 0) + ((b.source === 'partner' || b.source === 'manual') ? 50 : 0);
      if (order === 'popular') {
        return scoreB - scoreA;
      }
      if (order === 'price_asc') return (a.price || 0) - (b.price || 0);
      if (order === 'price_desc') return (b.price || 0) - (a.price || 0);
      // default: date_asc with sponsor boost
      if (scoreB !== scoreA) return scoreB - scoreA;
      return new Date(a.event_date) - new Date(b.event_date);
    });
    return list;
  }, [filtered, adv]);

  const featured = sorted.find(e => e.is_sponsored);
  const grid = sorted.filter(e => e.id !== featured?.id);
  const advActiveCount = adv ? Object.keys(adv).filter(k => {
    const v = adv[k]; const def = DEFAULT_ADV[k];
    if (Array.isArray(v)) return JSON.stringify(v) !== JSON.stringify(def);
    return v !== def;
  }).length : 0;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#09090f', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#A855F7" size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#09090f' }}>
      <ScrollView showsVerticalScrollIndicator={false}>
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
                paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20,
                borderWidth: 1.5,
                borderColor: city === c ? '#7C3AED' : 'rgba(255,255,255,0.1)',
                backgroundColor: city === c ? '#7C3AED' : 'transparent',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: city === c ? '700' : '400', fontSize: 13 }}>{c}</Text>
            </Pressable>
          ))}
        </View>

        {/* Search bar + filter button */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 14, gap: 10 }}>
          <View style={{
            flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
            backgroundColor: '#111118', borderWidth: 1, borderColor: 'rgba(168,85,247,0.2)',
            borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
          }}>
            <Text style={{ color: '#64748B', fontSize: 16 }}>🔍</Text>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Cerca evento, locale o zona..."
              placeholderTextColor="#64748B"
              style={{ flex: 1, color: '#fff', fontSize: 14, paddingVertical: 0 }}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <Text style={{ color: '#64748B', fontSize: 20, lineHeight: 22 }}>×</Text>
              </Pressable>
            )}
          </View>
          <Pressable
            onPress={() => setAdvOpen(true)}
            style={({ pressed }) => ({
              width: 44, height: 44, borderRadius: 12,
              backgroundColor: advActiveCount > 0 ? '#7C3AED' : '#111118',
              borderWidth: 1,
              borderColor: advActiveCount > 0 ? '#7C3AED' : 'rgba(168,85,247,0.25)',
              alignItems: 'center', justifyContent: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Ionicons name="options" size={18} color={advActiveCount > 0 ? '#fff' : '#A855F7'} />
            {advActiveCount > 0 && (
              <View style={{
                position: 'absolute', top: -4, right: -4,
                backgroundColor: '#FBBF24', borderRadius: 9, minWidth: 18, height: 18,
                alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
              }}>
                <Text style={{ color: '#09090f', fontSize: 10, fontWeight: '800' }}>{advActiveCount}</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Category chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingBottom: 8 }}>
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

        {/* Quick tags chips (Live Music, Gratis, Tavoli, Guestlist, After dinner) */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingTop: 8 }}>
          {QUICK_TAGS.map(t => {
            const active = quickTag === t;
            return (
              <Pressable
                key={t}
                onPress={() => setQuickTag(active ? null : t)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16,
                  backgroundColor: active ? 'rgba(168,85,247,0.18)' : '#111118',
                  borderWidth: 1,
                  borderColor: active ? '#A855F7' : 'rgba(168,85,247,0.15)',
                }}
              >
                <Text style={{ color: active ? '#A855F7' : '#9CA3AF', fontSize: 12, fontWeight: active ? '700' : '500' }}>
                  {t}
                </Text>
              </Pressable>
            );
          })}
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
          <EmptyState
            icon="🌃"
            title="Nessun evento trovato"
            subtitle="Prova a modificare filtri, città o data."
            actionLabel={(cat !== 'Tutti' || quickTag || search || adv) ? 'Reset filtri' : null}
            onAction={() => { setCat('Tutti'); setQuickTag(null); setSearch(''); setAdv(null); }}
          />
        ) : (
          <>
            {featured && (
              <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
                <FeaturedCard event={featured} onPress={() => router.push(`/event/${featured.id}`)} />
              </View>
            )}
            {grid.length > 0 && (
              <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
                <Text style={{ color: '#64748B', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' }}>
                  {featured ? 'Altri eventi' : 'Tutti gli eventi'}
                </Text>
              </View>
            )}
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

      <AdvancedFiltersModal
        visible={advOpen}
        zones={zones}
        initial={adv || DEFAULT_ADV}
        onApply={setAdv}
        onClose={() => setAdvOpen(false)}
      />
    </View>
  );
}
