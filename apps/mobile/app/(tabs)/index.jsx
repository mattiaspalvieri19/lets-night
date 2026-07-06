import { useEffect, useMemo, useState, useCallback } from 'react';
import { ScrollView, View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';
import { CATS, CITIES, QUICK_TAGS, COLORS, FONT_FAMILY, isInDateRange, todayLocal } from '@lets-night/shared';
import { useI18n } from '../../lib/i18n';
import EventCard from '../../components/EventCard';
import FeaturedCard from '../../components/FeaturedCard';
import EmptyState from '../../components/EmptyState';
import AdvancedFiltersModal from '../../components/AdvancedFiltersModal';

const DEFAULT_ADV = {
  cities: [...CITIES],
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
  if (slot === 'aperitivo') return h >= 18 && h < 21;
  if (slot === 'cena')      return h >= 20 && h < 23;
  if (slot === 'serata')    return h >= 22 || h < 2;
  if (slot === 'after')     return h >= 2 && h < 6;
  return true;
}


export default function HomeScreen() {
  const { t, fmtDate } = useI18n();
  const [city, setCity] = useState('Milano');
  const [cat, setCat] = useState('Tutti');
  const [quickTag, setQuickTag] = useState(null);
  const [search, setSearch] = useState('');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [advOpen, setAdvOpen] = useState(false);
  const [adv, setAdv] = useState(null); // null = nessun filtro avanzato attivo
  const { session } = useSession();
  const [unread, setUnread] = useState(0);

  // Conteggio notifiche non lette, aggiornato a ogni focus (es. tornando dalla schermata Notifiche).
  useFocusEffect(useCallback(() => {
    if (!session) { setUnread(0); return; }
    let cancelled = false;
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .eq('read', false)
      .then(({ count }) => { if (!cancelled) setUnread(count || 0); });
    return () => { cancelled = true; };
  }, [session]));

  useEffect(() => {
    async function loadEvents() {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('events')
        .select('*, venues(name, zona, city, is_partner, cover_image)')
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
    // Solo zone delle città lanciate (Milano-only) → niente zone di Roma residue dai seed.
    const set = new Set(events.filter(e => CITIES.includes(e.venues?.city)).map(e => e.venues?.zona).filter(Boolean));
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
        if (!isInDateRange(e.event_date, adv.dateRange)) return false;
        if (!timeSlotMatch(adv.timeSlot, e.event_time)) return false;
        const price = e.price == null ? null : Number(e.price);
        if (adv.entryType === 'free' && !(price === 0 || price == null)) return false;
        if (adv.entryType === 'paid' && !(price > 0)) return false;
        if (adv.entryType === 'guestlist' && !(e.tags || []).map(t => t.toLowerCase()).includes('guestlist')) return false;
        if (adv.entryType === 'table' && !(e.tags || []).map(t => t.toLowerCase()).includes('tavoli') && !e.has_tables) return false;
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
      if (order === 'popular') return scoreB - scoreA;
      if (order === 'date_desc') return new Date(b.event_date) - new Date(a.event_date);
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
      <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={COLORS.brand} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 64, paddingBottom: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 5 }}>
              Milano · {fmtDate(todayLocal())}
            </Text>
            <Text style={{ fontFamily: FONT_FAMILY.displayHeavy, color: COLORS.textPrimary, fontSize: 30, letterSpacing: -0.8 }}>
              Let&apos;s Night
            </Text>
          </View>
          <Pressable onPress={() => router.push('/notifications')} hitSlop={8} style={({ pressed }) => ({ marginTop: 6, padding: 4, opacity: pressed ? 0.6 : 1 })}>
            <Ionicons name="notifications-outline" size={26} color={COLORS.textPrimary} />
            {unread > 0 && (
              <View style={{ position: 'absolute', top: 0, right: 0, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: COLORS.brandStrong, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: COLORS.bg }}>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* City toggle — nascosto in modalità single-city */}
        {CITIES.length > 1 && (
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
        )}

        {/* Search bar + filter button */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginTop: 18, marginBottom: 14, gap: 10 }}>
          <View style={{
            flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
            backgroundColor: COLORS.bgElev2,
            borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
          }}>
            <Ionicons name="search" size={16} color={COLORS.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t('home.searchPlaceholder')}
              placeholderTextColor={COLORS.textMuted}
              style={{ flex: 1, color: COLORS.textPrimary, fontSize: 14, paddingVertical: 0 }}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <Ionicons name="close" size={16} color={COLORS.textMuted} />
              </Pressable>
            )}
          </View>
          <Pressable
            onPress={() => setAdvOpen(true)}
            style={({ pressed }) => ({
              width: 44, height: 44, borderRadius: 12,
              backgroundColor: advActiveCount > 0 ? COLORS.brandStrong : COLORS.bgElev2,
              alignItems: 'center', justifyContent: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Ionicons name="options" size={18} color={advActiveCount > 0 ? '#fff' : COLORS.textSecondary} />
            {advActiveCount > 0 && (
              <View style={{
                position: 'absolute', top: -4, right: -4,
                backgroundColor: '#fff', borderRadius: 9, minWidth: 18, height: 18,
                alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
              }}>
                <Text style={{ color: COLORS.bg, fontSize: 10, fontWeight: '800' }}>{advActiveCount}</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Category chips — attiva: bianco pieno */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingBottom: 8 }}>
          {CATS.map(c => {
            const active = cat === c;
            return (
              <Pressable
                key={c}
                onPress={() => setCat(c)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                  backgroundColor: active ? '#fff' : COLORS.bgElev2,
                }}
              >
                <Text style={{
                  color: active ? COLORS.bg : COLORS.textSecondary,
                  fontWeight: active ? '700' : '500',
                  fontSize: 13,
                }}>{c}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Quick tags */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingTop: 2 }}>
          {QUICK_TAGS.map(t => {
            const active = quickTag === t;
            return (
              <Pressable
                key={t}
                onPress={() => setQuickTag(active ? null : t)}
                style={{
                  paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? '#fff' : COLORS.borderSubtle,
                  backgroundColor: 'transparent',
                }}
              >
                <Text style={{
                  color: active ? '#fff' : COLORS.textMuted,
                  fontSize: 12,
                  fontWeight: active ? '600' : '500',
                }}>
                  {t}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Section title */}
        <View style={{ paddingHorizontal: 20, marginTop: 28, marginBottom: 14, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 21, letterSpacing: -0.3 }}>
            {t('home.upcoming')}
          </Text>
          <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>
            {t('home.eventsCount', { count: sorted.length })}
          </Text>
        </View>

        {sorted.length === 0 ? (
          <EmptyState
            icon="🌃"
            title={t('home.emptyTitle')}
            subtitle={t('home.emptySub')}
            actionLabel={(cat !== 'Tutti' || quickTag || search || adv) ? t('home.resetFilters') : null}
            onAction={() => { setCat('Tutti'); setQuickTag(null); setSearch(''); setAdv(null); }}
          />
        ) : (
          <>
            {featured && (
              <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
                <FeaturedCard event={featured} onPress={() => router.push(`/event/${featured.id}`)} />
              </View>
            )}
            {featured && grid.length > 0 && (
              <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
                <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase' }}>
                  {t('home.otherEvents')}
                </Text>
              </View>
            )}
            <View style={{ paddingHorizontal: 20 }}>
              {grid.map(item => (
                <EventCard key={item.id} event={item} onPress={() => router.push(`/event/${item.id}`)} />
              ))}
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
