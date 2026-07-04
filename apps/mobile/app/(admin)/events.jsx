import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, TextInput } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { formatDate, formatTime, getPriceLabel, COLORS, FONT_FAMILY } from '@lets-night/shared';

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export default function AdminEvents() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  async function loadData() {
    const { data: evs, error } = await supabase
      .from('events')
      .select('*, venues(name, zona, city)')
      .order('event_date', { ascending: false });
    if (error) console.error('Errore eventi admin:', error);
    setEvents(evs || []);
    setLoading(false);
  }

  useFocusEffect(useCallback(() => { loadData(); }, []));
  const onRefresh = useCallback(async () => { setRefreshing(true); await loadData(); setRefreshing(false); }, []);

  async function toggleActive(ev) {
    await supabase.from('events').update({ is_active: !ev.is_active }).eq('id', ev.id);
    loadData();
  }

  const today = todayLocal();
  const filtered = events.filter(e => {
    if (filter === 'upcoming') {
      if (!(e.event_date >= today && e.is_active)) return false;
    } else if (filter === 'inactive') {
      if (e.is_active) return false;
    } else if (filter === 'past') {
      if (!(e.event_date < today)) return false;
    } else if (filter === 'soldout') {
      if (!(e.capacity && e.booked_count >= e.capacity)) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const hay = `${e.title || ''} ${e.category || ''} ${e.venues?.name || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const counts = {
    all:      events.length,
    upcoming: events.filter(e => e.event_date >= today && e.is_active).length,
    inactive: events.filter(e => !e.is_active).length,
    past:     events.filter(e => e.event_date < today).length,
    soldout:  events.filter(e => e.capacity && e.booked_count >= e.capacity).length,
  };

  if (loading) return <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={COLORS.brand} size="large" /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 }}>
        <Text style={{ color: COLORS.danger, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', fontWeight: '600', marginBottom: 4 }}>Admin</Text>
        <Text style={{ fontFamily: FONT_FAMILY.display, color: '#fff', fontSize: 22, letterSpacing: -0.3 }}>Tutti gli eventi</Text>

        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: COLORS.bgElev3, borderRadius: 8,
          borderWidth: 1, borderColor: COLORS.borderSubtle,
          paddingHorizontal: 12, paddingVertical: 8,
          marginTop: 14,
        }}>
          <TextInput
            value={search} onChangeText={setSearch}
            placeholder="Cerca per titolo, categoria o locale..."
            placeholderTextColor={COLORS.textDisabled}
            style={{ flex: 1, color: '#fff', fontSize: 13, paddingVertical: 0 }}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={10}>
              <Text style={{ color: COLORS.textMuted, fontSize: 16 }}>×</Text>
            </Pressable>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, marginTop: 12 }}>
          {[
            ['all',      'Tutti'],
            ['upcoming', 'In programma'],
            ['inactive', 'Disattivati'],
            ['past',     'Passati'],
            ['soldout',  'Sold out'],
          ].map(([id, label]) => {
            const active = filter === id;
            return (
              <Pressable key={id} onPress={() => setFilter(id)}
                style={{
                  paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12,
                  backgroundColor: active ? COLORS.textPrimary : 'transparent',
                  borderWidth: 1,
                  borderColor: active ? COLORS.textPrimary : COLORS.borderSubtle,
                }}
              >
                <Text style={{
                  color: active ? COLORS.bg : COLORS.textSecondary,
                  fontSize: 11,
                  fontWeight: active ? '600' : '500',
                }}>
                  {label} <Text style={{ color: COLORS.textDisabled }}>({counts[id]})</Text>
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}>
        {filtered.length === 0 ? (
          <View style={{
            alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24,
            backgroundColor: COLORS.bgElev2, borderRadius: 10,
            borderWidth: 1, borderColor: COLORS.borderSubtle,
          }}>
            <Text style={{ fontFamily: FONT_FAMILY.display, color: '#fff', fontSize: 15, marginBottom: 6, textAlign: 'center' }}>
              Nessun evento per questo filtro
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 13, textAlign: 'center' }}>
              Cambia filtro o resetta la ricerca.
            </Text>
          </View>
        ) : filtered.map(ev => {
          const isPast = ev.event_date < today;
          return (
            <Pressable
              key={ev.id}
              onPress={() => router.push(`/(admin)/event/${ev.id}`)}
              style={({ pressed }) => ({
                backgroundColor: COLORS.bgElev2, borderRadius: 14, padding: 16, marginBottom: 12,
                borderWidth: 1, borderColor: ev.is_active ? COLORS.borderStrong : COLORS.borderSubtle,
                opacity: isPast ? 0.7 : (pressed ? 0.85 : 1),
              })}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ color: COLORS.brand, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 3 }}>
                    {ev.venues?.name || 'Locale'} · {ev.category}
                  </Text>
                  <Text style={{ fontFamily: FONT_FAMILY.display, color: '#fff', fontSize: 15, marginBottom: 4 }} numberOfLines={2}>{ev.title}</Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>{formatDate(ev.event_date)} · {formatTime(ev.event_time)}</Text>
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                    <Text style={{ color: COLORS.textSecondary, fontSize: 12 }}>{getPriceLabel(ev.price)}</Text>
                    {ev.capacity && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Ionicons name="people-outline" size={13} color={COLORS.textSecondary} />
                        <Text style={{ color: COLORS.textSecondary, fontSize: 12 }}>{ev.booked_count || 0}/{ev.capacity}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Pressable onPress={(e) => { e.stopPropagation?.(); toggleActive(ev); }} hitSlop={6}
                  style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: ev.is_active ? 'rgba(74,222,128,0.12)' : 'rgba(100,116,139,0.15)', borderWidth: 1, borderColor: ev.is_active ? 'rgba(74,222,128,0.35)' : 'rgba(100,116,139,0.3)' }}
                >
                  <Text style={{ color: ev.is_active ? COLORS.success : COLORS.textMuted, fontSize: 12, fontWeight: '700' }}>
                    {ev.is_active ? 'Attivo' : 'Nascosto'}
                  </Text>
                </Pressable>
              </View>
              <Text style={{ color: COLORS.brand, fontSize: 11, marginTop: 10, textAlign: 'right' }}>
                Tocca per gestire →
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
