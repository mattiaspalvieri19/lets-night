import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, FlatList, Pressable, TextInput,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';
import { formatDate, formatTime, getPriceLabel } from '@lets-night/shared';
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
        .eq('role', 'user')
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
    setVenues(venuesRes.data || []);
    setEvents(eventsRes.data || []);
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
      <View style={{ flex: 1, backgroundColor: '#09090f', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#A855F7" size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#09090f' }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12 }}>
        <Text style={{ color: '#A855F7', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4, fontWeight: '600' }}>
          Cerca
        </Text>
        <Text style={{ color: '#fff', fontSize: 26, fontWeight: '700', letterSpacing: -0.5 }}>
          Trova nella community
        </Text>
        <Text style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>
          Utenti, locali ed eventi a Milano e Roma
        </Text>
      </View>

      {/* Search bar */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: '#18181f', borderRadius: 10,
          borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
          paddingHorizontal: 14, paddingVertical: 10,
        }}>
          <Text style={{ fontSize: 14 }}>🔍</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={tab === 'users' ? 'Cerca utenti...' : tab === 'venues' ? 'Cerca locali...' : 'Cerca eventi...'}
            placeholderTextColor="#475569"
            autoCapitalize="none"
            style={{ flex: 1, color: '#fff', fontSize: 14, paddingVertical: 0 }}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={10}>
              <Text style={{ color: '#64748B', fontSize: 18 }}>×</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Tabs entity */}
      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
        {ENTITY_TABS.map(t => {
          const active = tab === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => setTab(t.id)}
              style={{
                flex: 1, paddingVertical: 12, alignItems: 'center',
                borderBottomWidth: 1,
                borderBottomColor: active ? '#A855F7' : 'transparent',
              }}
            >
              <Text style={{
                color: active ? '#fff' : '#64748B',
                fontSize: 12, fontWeight: active ? '600' : '500',
                letterSpacing: 0.2,
              }}>
                {t.label} <Text style={{ color: '#475569', fontWeight: '500' }}>({counts[t.id]})</Text>
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Results */}
      {tab === 'users' && (
        filteredUsers.length === 0 ? (
          <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#A855F7" />}>
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
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#A855F7" />}
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
          <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#A855F7" />}>
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
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#A855F7" />}
            renderItem={({ item }) => <VenueCard venue={item} />}
          />
        )
      )}

      {tab === 'events' && (
        filteredEvents.length === 0 ? (
          <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#A855F7" />}>
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
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#A855F7" />}
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
        backgroundColor: '#111118',
        borderRadius: 10, padding: 14, marginBottom: 8,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Text style={{ color: '#A855F7', fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: '600' }}>
          {venue.category}
        </Text>
        {venue.is_partner && (
          <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(168,85,247,0.4)' }}>
            <Text style={{ color: '#A855F7', fontSize: 9, fontWeight: '700' }}>PARTNER</Text>
          </View>
        )}
      </View>
      <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15, marginBottom: 4, letterSpacing: -0.2 }} numberOfLines={1}>
        {venue.name}
      </Text>
      <Text style={{ color: '#94A3B8', fontSize: 12 }}>
        {venue.zona}, {venue.city}
      </Text>
      {venue.description && (
        <Text style={{ color: '#64748B', fontSize: 12, marginTop: 6, lineHeight: 17 }} numberOfLines={2}>
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
        backgroundColor: '#111118',
        borderRadius: 10, padding: 14, marginBottom: 8,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ color: '#A855F7', fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: '600', marginBottom: 4 }}>
        {event.category}
      </Text>
      <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15, marginBottom: 4, letterSpacing: -0.2 }} numberOfLines={2}>
        {event.title}
      </Text>
      <Text style={{ color: '#94A3B8', fontSize: 12 }}>
        {event.venues?.name} · {event.venues?.zona}, {event.venues?.city}
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <Text style={{ color: '#64748B', fontSize: 11 }}>
          {formatDate(event.event_date)} · {formatTime(event.event_time) || '—'}
        </Text>
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
          {getPriceLabel(event.price)}
        </Text>
      </View>
    </Pressable>
  );
}
