import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, FlatList, Pressable, TextInput,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';
import { CITIES, COLORS, FONT_FAMILY, formatDate, formatTime, getPriceLabel } from '@lets-night/shared';
import UserCard from '../../components/UserCard';
import EmptyState from '../../components/EmptyState';

const ENTITY_TABS = [
  { id: 'users',  label: 'Utenti' },
  { id: 'venues', label: 'Locali' },
  { id: 'events', label: 'Eventi' },
];

function normalize(s) {
  return (s || '').trim().toLowerCase();
}

export default function SearchScreen() {
  const { session } = useSession();
  const myId = session?.user?.id;

  const [tab, setTab] = useState('users');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [users, setUsers] = useState([]);
  const [venues, setVenues] = useState([]);
  const [events, setEvents] = useState([]);
  const [followingIds, setFollowingIds] = useState(new Set());
  const [busyId, setBusyId] = useState(null);

  async function loadAll() {
    const today = new Date().toISOString().split('T')[0];
    const [usersRes, venuesRes, eventsRes, followsRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, display_name, full_name, username, bio, avatar_url, city, interests, privacy_settings, role')
        .or('role.eq.user,role.is.null')
        .limit(60),
      supabase
        .from('venues')
        .select('id, name, category, city, zona, description, is_verified, is_partner')
        .eq('is_verified', true)
        .order('name', { ascending: true })
        .limit(60),
      supabase
        .from('events')
        .select('id, title, category, event_date, event_time, price, venues(name, zona, city)')
        .eq('is_active', true)
        .gte('event_date', today)
        .order('event_date', { ascending: true })
        .limit(60),
      myId
        ? supabase.from('follows').select('following_id').eq('follower_id', myId)
        : Promise.resolve({ data: [] }),
    ]);

    const usersList = (usersRes.data || []).filter(u =>
      u.id !== myId && (u.privacy_settings || {}).searchable !== false
    );
    setUsers(usersList);
    // Milano-only: nasconde locali ed eventi di altre città (es. seed di Roma) dalla ricerca.
    setVenues((venuesRes.data || []).filter(v => CITIES.includes(v.city)));
    setEvents((eventsRes.data || []).filter(e => CITIES.includes(e.venues?.city)));
    setFollowingIds(new Set((followsRes.data || []).map(r => r.following_id)));
  }

  useFocusEffect(useCallback(() => {
    setLoading(true);
    loadAll().finally(() => setLoading(false));
  }, [myId]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [myId]);

  async function toggleFollow(targetId) {
    if (!myId) { router.push('/auth/login'); return; }
    setBusyId(targetId);
    if (followingIds.has(targetId)) {
      await supabase.from('follows').delete().eq('follower_id', myId).eq('following_id', targetId);
      setFollowingIds(prev => { const n = new Set(prev); n.delete(targetId); return n; });
    } else {
      await supabase.from('follows').insert({ follower_id: myId, following_id: targetId });
      setFollowingIds(prev => new Set(prev).add(targetId));
    }
    setBusyId(null);
  }

  const q = normalize(query);

  const filteredUsers = useMemo(() => {
    if (!q) return users;
    return users.filter(u => {
      const hay = `${u.display_name || ''} ${u.full_name || ''} ${u.username || ''} ${u.bio || ''} ${u.city || ''} ${(u.interests || []).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [users, q]);

  const filteredVenues = useMemo(() => {
    if (!q) return venues;
    return venues.filter(v => {
      const hay = `${v.name || ''} ${v.category || ''} ${v.city || ''} ${v.zona || ''} ${v.description || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [venues, q]);

  const filteredEvents = useMemo(() => {
    if (!q) return events;
    return events.filter(e => {
      const hay = `${e.title || ''} ${e.category || ''} ${e.venues?.name || ''} ${e.venues?.zona || ''} ${e.venues?.city || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [events, q]);

  const counts = {
    users: filteredUsers.length,
    venues: filteredVenues.length,
    events: filteredEvents.length,
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={COLORS.brand} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 64, paddingBottom: 14 }}>
        <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>
          Cerca
        </Text>
        <Text style={{ fontFamily: FONT_FAMILY.displayHeavy, color: COLORS.textPrimary, fontSize: 28, letterSpacing: -0.6 }}>
          Trova nella community
        </Text>
        <Text style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 6 }}>
          Utenti, locali ed eventi a Milano
        </Text>
      </View>

      {/* Search bar */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 14 }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          backgroundColor: COLORS.bgElev2, borderRadius: 12,
          paddingHorizontal: 14, paddingVertical: 12,
        }}>
          <Ionicons name="search" size={16} color={COLORS.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={tab === 'users' ? 'Cerca utenti' : tab === 'venues' ? 'Cerca locali' : 'Cerca eventi'}
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="none"
            style={{ flex: 1, color: COLORS.textPrimary, fontSize: 14, paddingVertical: 0 }}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={10}>
              <Ionicons name="close" size={16} color={COLORS.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Tabs entity */}
      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.borderSubtle }}>
        {ENTITY_TABS.map(t => {
          const active = tab === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => setTab(t.id)}
              style={{
                flex: 1, paddingVertical: 12, alignItems: 'center',
                borderBottomWidth: 1,
                borderBottomColor: active ? '#FAFAFA' : 'transparent',
              }}
            >
              <Text style={{
                color: active ? COLORS.textPrimary : COLORS.textMuted,
                fontSize: 12, fontWeight: active ? '700' : '500',
                letterSpacing: 0.2,
              }}>
                {t.label} <Text style={{ color: COLORS.textDisabled, fontWeight: '500' }}>({counts[t.id]})</Text>
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Results */}
      {tab === 'users' && (
        filteredUsers.length === 0 ? (
          <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}>
            <EmptyState
              title={query ? 'Nessun utente trovato' : 'Nessun utente'}
              subtitle={query ? 'Modifica la ricerca o prova un altro nome.' : 'La community è in crescita.'}
              actionLabel={query ? 'Reset' : null}
              onAction={() => setQuery('')}
            />
          </ScrollView>
        ) : (
          <FlatList
            data={filteredUsers}
            keyExtractor={u => u.id}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 80 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}
            renderItem={({ item }) => (
              <UserCard
                user={item}
                isFollowing={followingIds.has(item.id)}
                busy={busyId === item.id}
                onToggleFollow={() => toggleFollow(item.id)}
                hideFollow={!myId}
              />
            )}
          />
        )
      )}

      {tab === 'venues' && (
        filteredVenues.length === 0 ? (
          <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}>
            <EmptyState
              title={query ? 'Nessun locale trovato' : 'Nessun locale'}
              subtitle={query ? 'Prova un altro nome, zona o categoria.' : 'Nessun locale verificato.'}
              actionLabel={query ? 'Reset' : null}
              onAction={() => setQuery('')}
            />
          </ScrollView>
        ) : (
          <FlatList
            data={filteredVenues}
            keyExtractor={v => v.id}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 80 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}
            renderItem={({ item }) => <VenueCard venue={item} />}
          />
        )
      )}

      {tab === 'events' && (
        filteredEvents.length === 0 ? (
          <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}>
            <EmptyState
              title={query ? 'Nessun evento trovato' : 'Nessun evento'}
              subtitle={query ? 'Prova un altro nome di evento o locale.' : 'Nessun evento in programma.'}
              actionLabel={query ? 'Reset' : null}
              onAction={() => setQuery('')}
            />
          </ScrollView>
        ) : (
          <FlatList
            data={filteredEvents}
            keyExtractor={e => e.id}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 80 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}
            renderItem={({ item }) => <EventResultCard event={item} />}
          />
        )
      )}
    </View>
  );
}

function VenueCard({ venue }) {
  return (
    <Pressable
      onPress={() => router.push(`/venue/${venue.id}`)}
      style={({ pressed }) => ({
        backgroundColor: COLORS.bgElev2,
        borderRadius: 14, padding: 14, marginBottom: 8,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Text style={{ color: COLORS.textMuted, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: '600' }}>
          {venue.category}
        </Text>
        {venue.is_partner && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: COLORS.brandSubtle, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 }}>
            <Ionicons name="star" size={8} color={COLORS.brand} />
            <Text style={{ color: COLORS.brand, fontSize: 9, fontWeight: '700' }}>PARTNER</Text>
          </View>
        )}
        {venue.is_verified && (
          <Ionicons name="checkmark-circle" size={12} color={COLORS.success} />
        )}
      </View>
      <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 15, letterSpacing: -0.2, marginBottom: 4 }} numberOfLines={1}>
        {venue.name}
      </Text>
      <Text style={{ color: COLORS.textSecondary, fontSize: 12 }}>
        {venue.zona}, {venue.city}
      </Text>
      {venue.description && (
        <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 6, lineHeight: 17 }} numberOfLines={2}>
          {venue.description}
        </Text>
      )}
    </Pressable>
  );
}

function EventResultCard({ event }) {
  return (
    <Pressable
      onPress={() => router.push(`/event/${event.id}`)}
      style={({ pressed }) => ({
        backgroundColor: COLORS.bgElev2,
        borderRadius: 14, padding: 14, marginBottom: 8,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ color: COLORS.textMuted, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: '600', marginBottom: 5 }}>
        {event.category}
      </Text>
      <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 15, letterSpacing: -0.2, marginBottom: 4 }} numberOfLines={2}>
        {event.title}
      </Text>
      <Text style={{ color: COLORS.textSecondary, fontSize: 12 }}>
        {event.venues?.name} · {event.venues?.zona}, {event.venues?.city}
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
        <Text style={{ color: COLORS.textMuted, fontSize: 11 }}>
          {formatDate(event.event_date)} · {formatTime(event.event_time) || '—'}
        </Text>
        <Text style={{ color: COLORS.textPrimary, fontSize: 13, fontWeight: '700' }}>
          {getPriceLabel(event.price)}
        </Text>
      </View>
    </Pressable>
  );
}
