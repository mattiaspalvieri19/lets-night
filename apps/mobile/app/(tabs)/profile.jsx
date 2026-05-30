import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { getLoyaltyLevel, formatDate, formatTime, getPriceLabel } from '@lets-night/shared';
import LoyaltyBlock from '../../components/LoyaltyBlock';
import EmptyState from '../../components/EmptyState';

const TABS = [
  { id: 'going',     label: 'Andrò a' },
  { id: 'past',      label: 'Sono stato a' },
  { id: 'favorites', label: 'Locali' },
  { id: 'badges',    label: 'Badge' },
];

function initialOf(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
}

export default function MyProfileScreen() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ bookings: 0, confirmed: 0, followers: 0, following: 0 });
  const [tab, setTab] = useState('going');
  const [futureBookings, setFutureBookings] = useState([]);
  const [pastBookings, setPastBookings] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [unlockedBadges, setUnlockedBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function loadData() {
    const { data: { session: s } } = await supabase.auth.getSession();
    setSession(s);
    if (!s) { setLoading(false); return; }

    const today = new Date().toISOString().split('T')[0];
    const myId = s.user.id;

    const [
      { data: prof },
      { data: bookingsList },
      { count: followersCount },
      { count: followingCount },
      { data: favs },
      { data: ums },
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', myId).maybeSingle(),
      supabase.from('bookings')
        .select('id, status, event_id, events(id, title, event_date, event_time, price, venues(name, zona, city))')
        .eq('user_id', myId)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false }),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', myId),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', myId),
      supabase.from('favorite_venues').select('venue_id, venues(id, name, zona, city, category)').eq('user_id', myId),
      supabase.from('user_milestones').select('milestone_id, unlocked_at, loyalty_milestones(*)').eq('user_id', myId).not('unlocked_at', 'is', null),
    ]);

    setProfile(prof);
    const all = bookingsList || [];
    const upcoming = all.filter(b => b.events && b.events.event_date >= today);
    const past = all.filter(b => b.events && b.events.event_date < today);
    setFutureBookings(upcoming);
    setPastBookings(past);
    setStats({
      bookings: all.length,
      confirmed: all.filter(b => b.status === 'confirmed').length,
      followers: followersCount || 0,
      following: followingCount || 0,
    });
    setFavorites((favs || []).filter(f => f.venues));
    setUnlockedBadges((ums || []).map(r => r.loyalty_milestones).filter(Boolean));

    setLoading(false);
  }

  useFocusEffect(useCallback(() => {
    setLoading(true);
    loadData();
  }, []));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#09090f', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#A855F7" size="large" />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={{ flex: 1, backgroundColor: '#09090f', paddingHorizontal: 32, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: 'rgba(168,85,247,0.18)', alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}>
          <Text style={{ fontSize: 36 }}>🌙</Text>
        </View>
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900', marginBottom: 8 }}>Il tuo profilo</Text>
        <Text style={{ color: '#9CA3AF', textAlign: 'center', marginBottom: 28, lineHeight: 21 }}>
          Accedi per vedere prenotazioni, badge e seguire i tuoi amici.
        </Text>
        <Pressable
          onPress={() => router.push('/auth/login')}
          style={{ backgroundColor: '#7C3AED', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 40, width: '100%', alignItems: 'center', marginBottom: 12 }}
        >
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Accedi</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/auth/register')}
          style={{ borderWidth: 1, borderColor: 'rgba(168,85,247,0.35)', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 40, width: '100%', alignItems: 'center' }}
        >
          <Text style={{ color: '#A855F7', fontWeight: '700', fontSize: 14 }}>Crea account</Text>
        </Pressable>
      </View>
    );
  }

  const display = profile?.display_name || profile?.full_name || session.user.email?.split('@')[0] || 'Utente';
  const handle = profile?.username ? `@${profile.username}` : null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#09090f' }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#A855F7" />}
    >
      {/* Header */}
      <View style={{ padding: 20, paddingTop: 60, alignItems: 'center' }}>
        <View style={{
          width: 88, height: 88, borderRadius: 44,
          backgroundColor: 'rgba(168,85,247,0.18)',
          alignItems: 'center', justifyContent: 'center',
          borderWidth: 2, borderColor: 'rgba(168,85,247,0.4)',
          marginBottom: 14,
        }}>
          <Text style={{ color: '#A855F7', fontSize: 38, fontWeight: '900' }}>{initialOf(display)}</Text>
        </View>
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900' }}>{display}</Text>
        {handle && <Text style={{ color: '#64748B', fontSize: 13, marginTop: 2 }}>{handle}</Text>}
        {profile?.bio && (
          <Text style={{ color: '#9CA3AF', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 10, paddingHorizontal: 16 }}>
            {profile.bio}
          </Text>
        )}
        {profile?.city && (
          <Text style={{ color: '#A855F7', fontSize: 12, marginTop: 8, fontWeight: '600' }}>📍 {profile.city}</Text>
        )}

        {Array.isArray(profile?.interests) && profile.interests.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14, justifyContent: 'center' }}>
            {profile.interests.map(t => (
              <View key={t} style={{
                backgroundColor: 'rgba(168,85,247,0.12)',
                borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4,
              }}>
                <Text style={{ color: '#A855F7', fontSize: 11, fontWeight: '600' }}>{t}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Stats grid */}
        <View style={{ flexDirection: 'row', gap: 22, marginTop: 18 }}>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '900' }}>{stats.bookings}</Text>
            <Text style={{ color: '#64748B', fontSize: 11, marginTop: 2 }}>prenotazioni</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '900' }}>{stats.confirmed}</Text>
            <Text style={{ color: '#64748B', fontSize: 11, marginTop: 2 }}>confermate</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '900' }}>{stats.followers}</Text>
            <Text style={{ color: '#64748B', fontSize: 11, marginTop: 2 }}>follower</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '900' }}>{stats.following}</Text>
            <Text style={{ color: '#64748B', fontSize: 11, marginTop: 2 }}>seguiti</Text>
          </View>
        </View>

        {/* Azioni: modifica + privacy */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 20, width: '100%' }}>
          <Pressable
            onPress={() => router.push('/profile/edit')}
            style={({ pressed }) => ({
              flex: 1, paddingVertical: 11, borderRadius: 11,
              backgroundColor: '#7C3AED',
              alignItems: 'center', opacity: pressed ? 0.85 : 1,
              flexDirection: 'row', justifyContent: 'center', gap: 6,
            })}
          >
            <Ionicons name="create-outline" size={15} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Modifica</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/profile/privacy')}
            style={({ pressed }) => ({
              flex: 1, paddingVertical: 11, borderRadius: 11,
              borderWidth: 1, borderColor: 'rgba(168,85,247,0.35)',
              alignItems: 'center', opacity: pressed ? 0.85 : 1,
              flexDirection: 'row', justifyContent: 'center', gap: 6,
            })}
          >
            <Ionicons name="shield-outline" size={15} color="#A855F7" />
            <Text style={{ color: '#A855F7', fontWeight: '700', fontSize: 13 }}>Privacy</Text>
          </Pressable>
        </View>
      </View>

      {/* Loyalty block */}
      <LoyaltyBlock points={profile?.loyalty_points || 0} compact />

      {/* Tabs */}
      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(168,85,247,0.12)' }}>
        {TABS.map(t => {
          const active = tab === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => setTab(t.id)}
              style={{
                flex: 1, paddingVertical: 13, alignItems: 'center',
                borderBottomWidth: 2,
                borderBottomColor: active ? '#A855F7' : 'transparent',
              }}
            >
              <Text style={{
                color: active ? '#fff' : '#64748B',
                fontSize: 12, fontWeight: active ? '800' : '500',
              }}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Tab content */}
      <View style={{ padding: 20 }}>
        {tab === 'going' && (
          futureBookings.length === 0 ? (
            <EmptyState
              compact icon="📅"
              title="Nessuna serata in arrivo"
              subtitle="Scopri eventi e prenota la tua prossima notte."
              actionLabel="Esplora eventi"
              onAction={() => router.push('/(tabs)')}
            />
          ) : (
            futureBookings.map(b => <BookingRow key={b.id} booking={b} />)
          )
        )}

        {tab === 'past' && (
          pastBookings.length === 0 ? (
            <EmptyState compact icon="🌙" title="Niente di passato" subtitle="Le tue serate passate appariranno qui." />
          ) : (
            pastBookings.map(b => <BookingRow key={b.id} booking={b} past />)
          )
        )}

        {tab === 'favorites' && (
          favorites.length === 0 ? (
            <EmptyState compact icon="❤️" title="Nessun locale preferito" subtitle="Salva i locali che ami per ritrovarli qui." />
          ) : (
            favorites.map(f => <VenueRow key={f.venue_id} venue={f.venues} />)
          )
        )}

        {tab === 'badges' && (
          unlockedBadges.length === 0 ? (
            <EmptyState
              compact icon="🏆"
              title="Ancora nessun badge"
              subtitle="Prenota eventi e completa traguardi per sbloccare i primi badge."
              actionLabel="Vedi traguardi"
              onAction={() => router.push('/loyalty')}
            />
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {unlockedBadges.map(m => (
                <View key={m.id} style={{
                  width: '31%', alignItems: 'center',
                  backgroundColor: '#111118', borderRadius: 12, paddingVertical: 16, paddingHorizontal: 8,
                  borderWidth: 1, borderColor: 'rgba(168,85,247,0.25)',
                }}>
                  <Text style={{ fontSize: 30, marginBottom: 6 }}>{m.icon || '🏆'}</Text>
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', textAlign: 'center' }} numberOfLines={2}>
                    {m.title}
                  </Text>
                </View>
              ))}
            </View>
          )
        )}
      </View>

      {/* Logout discreto in fondo */}
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32, alignItems: 'center' }}>
        <Pressable onPress={handleLogout} hitSlop={8}>
          <Text style={{ color: '#64748B', fontSize: 13, textDecorationLine: 'underline' }}>
            Esci dall&apos;account
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function BookingRow({ booking, past }) {
  const ev = booking.events;
  if (!ev) return null;
  return (
    <Pressable
      onPress={() => router.push(`/event/${ev.id}`)}
      style={({ pressed }) => ({
        backgroundColor: '#111118',
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: 'rgba(168,85,247,0.12)',
        opacity: past ? 0.7 : (pressed ? 0.85 : 1),
      })}
    >
      <Text style={{ color: '#A855F7', fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>
        {ev.venues?.name || 'Locale'}
      </Text>
      <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }} numberOfLines={1}>{ev.title}</Text>
      <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 4 }}>
        {formatDate(ev.event_date)} · {formatTime(ev.event_time) || '—'} · {getPriceLabel(ev.price)}
      </Text>
    </Pressable>
  );
}

function VenueRow({ venue }) {
  if (!venue) return null;
  return (
    <Pressable
      onPress={() => router.push(`/venue/${venue.id}`)}
      style={({ pressed }) => ({
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        backgroundColor: '#111118', borderRadius: 12, padding: 14, marginBottom: 10,
        borderWidth: 1, borderColor: 'rgba(168,85,247,0.12)',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }} numberOfLines={1}>{venue.name}</Text>
        <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>
          {venue.category} · {venue.zona}, {venue.city}
        </Text>
      </View>
      <Text style={{ color: '#A855F7', fontSize: 18 }}>›</Text>
    </Pressable>
  );
}
