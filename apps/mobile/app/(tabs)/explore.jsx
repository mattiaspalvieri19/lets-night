import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, FlatList, Pressable, TextInput,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';
import UserCard from '../../components/UserCard';
import EmptyState from '../../components/EmptyState';

const SOCIAL_FILTERS = [
  { id: 'all',         label: 'Tutti' },
  { id: 'following',   label: 'Già segui' },
  { id: 'same_city',   label: 'Vicino a te' },
  { id: 'university',  label: 'Universitari' },
  { id: 'aperitivo',   label: 'Ama aperitivi' },
  { id: 'vip',         label: 'VIP' },
];

export default function SearchUsersScreen() {
  const { session } = useSession();
  const myId = session?.user?.id;

  const [users, setUsers] = useState([]);
  const [followingIds, setFollowingIds] = useState(new Set());
  const [busyId, setBusyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [myCity, setMyCity] = useState(null);

  async function loadFollowing(uid) {
    if (!uid) return new Set();
    const { data } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', uid);
    return new Set((data || []).map(r => r.following_id));
  }

  async function loadUsers() {
    let query = supabase
      .from('profiles')
      .select('id, display_name, full_name, username, bio, avatar_url, city, interests, privacy_settings')
      .eq('role', 'user')
      .limit(60);
    if (myId) query = query.neq('id', myId);
    const { data } = await query;
    // Filtra utenti non searchable
    const visible = (data || []).filter(u => {
      const ps = u.privacy_settings || {};
      return ps.searchable !== false;
    });
    setUsers(visible);
  }

  async function loadMyProfile() {
    if (!myId) { setMyCity(null); return; }
    const { data } = await supabase
      .from('profiles')
      .select('city')
      .eq('id', myId)
      .maybeSingle();
    setMyCity(data?.city || null);
  }

  useFocusEffect(useCallback(() => {
    setLoading(true);
    Promise.all([
      loadUsers(),
      loadFollowing(myId).then(setFollowingIds),
      loadMyProfile(),
    ]).finally(() => setLoading(false));
  }, [myId]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      loadUsers(),
      loadFollowing(myId).then(setFollowingIds),
    ]);
    setRefreshing(false);
  }, [myId]);

  async function toggleFollow(targetId) {
    if (!myId) { router.push('/auth/login'); return; }
    setBusyId(targetId);
    const isFollowing = followingIds.has(targetId);
    if (isFollowing) {
      await supabase.from('follows')
        .delete()
        .eq('follower_id', myId)
        .eq('following_id', targetId);
      setFollowingIds(prev => { const n = new Set(prev); n.delete(targetId); return n; });
    } else {
      await supabase.from('follows')
        .insert({ follower_id: myId, following_id: targetId });
      setFollowingIds(prev => new Set(prev).add(targetId));
    }
    setBusyId(null);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter(u => {
      // Query: nome / username / bio
      if (q) {
        const hay = `${u.display_name || ''} ${u.full_name || ''} ${u.username || ''} ${u.bio || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      // Filtri chip
      if (filter === 'following' && !followingIds.has(u.id)) return false;
      if (filter === 'same_city' && myCity && u.city !== myCity) return false;
      if (filter === 'university' && !(u.interests || []).map(s => s.toLowerCase()).includes('universitario')) return false;
      if (filter === 'aperitivo' && !(u.interests || []).map(s => s.toLowerCase()).includes('aperitivo')) return false;
      if (filter === 'vip' && !(u.interests || []).map(s => s.toLowerCase()).includes('vip')) return false;
      return true;
    });
  }, [users, query, filter, followingIds, myCity]);

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
        <Text style={{ color: '#A855F7', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
          Social
        </Text>
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: -0.5 }}>Cerca</Text>
        <Text style={{ color: '#64748B', fontSize: 14, marginTop: 4 }}>
          Trova persone con cui vivere la serata
        </Text>
      </View>

      {/* Search bar */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: '#18181f', borderRadius: 12,
          borderWidth: 1, borderColor: 'rgba(168,85,247,0.18)',
          paddingHorizontal: 14, paddingVertical: 10,
        }}>
          <Text style={{ fontSize: 16 }}>🔍</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Cerca utenti..."
            placeholderTextColor="#4B5563"
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

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 14, gap: 8 }}
      >
        {SOCIAL_FILTERS.map(f => {
          const active = filter === f.id;
          const disabled = (f.id === 'following' || f.id === 'same_city') && !myId;
          return (
            <Pressable
              key={f.id}
              onPress={() => !disabled && setFilter(f.id)}
              disabled={disabled}
              style={{
                paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18,
                backgroundColor: active ? '#7C3AED' : '#18181f',
                borderWidth: 1,
                borderColor: active ? '#7C3AED' : 'rgba(168,85,247,0.2)',
                opacity: disabled ? 0.4 : 1,
              }}
            >
              <Text style={{
                color: active ? '#fff' : '#9CA3AF',
                fontSize: 12,
                fontWeight: active ? '700' : '500',
              }}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Results */}
      {filtered.length === 0 ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#A855F7" />}
        >
          <EmptyState
            icon="🌃"
            title={query ? 'Nessun utente trovato' : 'Nessuno qui per ora'}
            subtitle={query
              ? 'Prova un altro nome o username.'
              : 'Torna più tardi: la community è in crescita.'}
            actionLabel={query ? 'Resetta ricerca' : null}
            onAction={() => setQuery('')}
          />
        </ScrollView>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={u => u.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 80 }}
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
      )}
    </View>
  );
}
