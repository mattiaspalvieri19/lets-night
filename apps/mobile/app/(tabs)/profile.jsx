import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, Image } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { getLoyaltyLevel } from '@lets-night/shared';
import LoyaltyBlock from '../../components/LoyaltyBlock';
import EmptyState from '../../components/EmptyState';
import ActivityCard from '../../components/ActivityCard';

// Profilo = "chi sei": identità + social + loyalty + badge + attività.
// Le prenotazioni/QR vivono nella tab Biglietti (niente doppione).
const TABS = [
  { id: 'activity',  label: 'Attività' },
  { id: 'badges',    label: 'Badge' },
  { id: 'favorites', label: 'Locali' },
];

function initialOf(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
}

export default function MyProfileScreen() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ followers: 0, following: 0 });
  const [tab, setTab] = useState('activity');
  const [activities, setActivities] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [unlockedBadges, setUnlockedBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function loadData(isCancelled = () => false) {
    const { data: { session: s } } = await supabase.auth.getSession();
    if (isCancelled()) return;
    setSession(s);
    if (!s) return;
    const myId = s.user.id;

    const [
      { data: prof, error: profErr },
      { count: followersCount },
      { count: followingCount },
      { data: favs, error: favsErr },
      { data: ums },
      { data: acts, error: actsErr },
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', myId).maybeSingle(),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', myId),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', myId),
      supabase.from('favorite_venues').select('venue_id, venues(id, name, zona, city, category)').eq('user_id', myId),
      supabase.from('user_milestones').select('milestone_id, unlocked_at, loyalty_milestones(*)').eq('user_id', myId).not('unlocked_at', 'is', null),
      supabase.from('activities').select('*, events(id, title, event_date), venues(id, name, zona, city)').eq('user_id', myId).order('created_at', { ascending: false }).limit(15),
    ]);
    if (profErr) console.error('Errore profilo:', profErr);
    if (favsErr) console.error('Errore preferiti:', favsErr);
    if (actsErr) console.error('Errore attività:', actsErr);

    if (isCancelled()) return;
    setProfile(prof);
    setStats({ followers: followersCount || 0, following: followingCount || 0 });
    setFavorites((favs || []).filter(f => f.venues));
    setUnlockedBadges((ums || []).map(r => r.loyalty_milestones).filter(Boolean));
    setActivities(acts || []);
  }

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;
    setLoading(true);
    loadData(isCancelled).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []));

  const onRefresh = useCallback(async () => {
    let cancelled = false;
    setRefreshing(true);
    await loadData(() => cancelled);
    setRefreshing(false);
    return () => { cancelled = true; };
  }, []);

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
          Accedi per vedere badge, livello e seguire i tuoi amici.
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

  const myId = session.user.id;
  const display = profile?.display_name || profile?.full_name || session.user.email?.split('@')[0] || 'Utente';
  const handle = profile?.username ? `@${profile.username}` : null;
  const points = profile?.loyalty_points || 0;
  const ll = getLoyaltyLevel(points);
  const needsCompletion = profile && (!profile.avatar_url || !profile.phone);

  return (
    <View style={{ flex: 1, backgroundColor: '#09090f' }}>
      {/* Impostazioni — icona in alto a destra */}
      <Pressable
        onPress={() => router.push('/settings')}
        hitSlop={10}
        style={{ position: 'absolute', top: 58, right: 18, zIndex: 10, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons name="settings-outline" size={22} color="#A855F7" />
      </Pressable>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#A855F7" />}
      >
        {/* Header identità */}
        <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 8, alignItems: 'center' }}>
          {profile?.avatar_url ? (
            <Image
              source={{ uri: profile.avatar_url }}
              style={{ width: 88, height: 88, borderRadius: 44, borderWidth: 2, borderColor: 'rgba(168,85,247,0.5)', marginBottom: 12 }}
            />
          ) : (
            <View style={{
              width: 88, height: 88, borderRadius: 44,
              backgroundColor: 'rgba(168,85,247,0.18)',
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 2, borderColor: 'rgba(168,85,247,0.4)',
              marginBottom: 12,
            }}>
              <Text style={{ color: '#A855F7', fontSize: 38, fontWeight: '900' }}>{initialOf(display)}</Text>
            </View>
          )}

          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900' }}>{display}</Text>

          {/* @handle + livello loyalty inline */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
            {handle && <Text style={{ color: '#64748B', fontSize: 13 }}>{handle}</Text>}
            <Pressable
              onPress={() => router.push('/loyalty')}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 5,
                paddingHorizontal: 9, paddingVertical: 3, borderRadius: 11,
                borderWidth: 1, borderColor: ll.level.color + '66', backgroundColor: ll.level.color + '1A',
              }}
            >
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: ll.level.color }} />
              <Text style={{ color: ll.level.color, fontSize: 11, fontWeight: '800' }}>{ll.level.name}</Text>
            </Pressable>
          </View>

          {profile?.bio ? (
            <Text style={{ color: '#9CA3AF', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 10, paddingHorizontal: 16 }}>
              {profile.bio}
            </Text>
          ) : null}
          {profile?.city ? (
            <Text style={{ color: '#A855F7', fontSize: 12, marginTop: 8, fontWeight: '600' }}>📍 {profile.city}</Text>
          ) : null}

          {Array.isArray(profile?.interests) && profile.interests.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12, justifyContent: 'center' }}>
              {profile.interests.map(t => (
                <View key={t} style={{ backgroundColor: 'rgba(168,85,247,0.12)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ color: '#A855F7', fontSize: 11, fontWeight: '600' }}>{t}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Banner completa profilo */}
          {needsCompletion && (
            <Pressable
              onPress={() => router.push('/profile/edit')}
              style={({ pressed }) => ({
                marginTop: 16, width: '100%',
                backgroundColor: 'rgba(245,158,11,0.1)',
                borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)',
                borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14,
                flexDirection: 'row', alignItems: 'center', gap: 10,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ fontSize: 16 }}>⚡</Text>
              <Text style={{ color: '#F59E0B', fontSize: 13, flex: 1, fontWeight: '600' }}>
                Completa il profilo {!profile.avatar_url && !profile.phone ? '— aggiungi foto e telefono' : !profile.avatar_url ? '— aggiungi una foto' : '— aggiungi il telefono'}
              </Text>
              <Text style={{ color: '#F59E0B', fontSize: 14 }}>›</Text>
            </Pressable>
          )}

          {/* Unico bottone: Modifica profilo */}
          <Pressable
            onPress={() => router.push('/profile/edit')}
            style={({ pressed }) => ({
              marginTop: 16, width: '100%', paddingVertical: 12, borderRadius: 12,
              backgroundColor: '#7C3AED', alignItems: 'center',
              flexDirection: 'row', justifyContent: 'center', gap: 6,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Ionicons name="create-outline" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Modifica profilo</Text>
          </Pressable>

          {/* Vedi profilo pubblico */}
          <Pressable
            onPress={() => router.push(`/user/${myId}`)}
            hitSlop={8}
            style={({ pressed }) => ({ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.6 : 1 })}
          >
            <Ionicons name="eye-outline" size={15} color="#64748B" />
            <Text style={{ color: '#64748B', fontSize: 13 }}>Vedi il tuo profilo pubblico</Text>
          </Pressable>
        </View>

        {/* Riga social compatta — toccabile */}
        <View style={{
          flexDirection: 'row', marginHorizontal: 20, marginTop: 14, marginBottom: 18,
          backgroundColor: '#111118', borderRadius: 14,
          borderWidth: 1, borderColor: 'rgba(168,85,247,0.12)',
        }}>
          <StatCell value={stats.followers} label="follower" onPress={() => router.push(`/user/${myId}`)} />
          <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 12 }} />
          <StatCell value={stats.following} label="seguiti" onPress={() => router.push(`/user/${myId}`)} />
          <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 12 }} />
          <StatCell value={points} label="punti" onPress={() => router.push('/loyalty')} />
        </View>

        {/* Loyalty card */}
        <LoyaltyBlock points={points} compact />

        {/* Tabs */}
        <View style={{ flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
          {TABS.map(t => {
            const active = tab === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => setTab(t.id)}
                style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: active ? '#A855F7' : 'transparent' }}
              >
                <Text style={{ color: active ? '#fff' : '#64748B', fontSize: 12, fontWeight: active ? '600' : '500', letterSpacing: 0.2 }}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Tab content */}
        <View style={{ padding: 20 }}>
          {tab === 'activity' && (
            activities.length === 0 ? (
              <EmptyState
                compact icon="✨"
                title="Nessuna attività ancora"
                subtitle="Prenota eventi e segui amici: la tua attività apparirà qui."
                actionLabel="Esplora eventi"
                onAction={() => router.push('/(tabs)')}
              />
            ) : (
              activities.map(a => <ActivityCard key={a.id} activity={a} hideAuthor />)
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

          {tab === 'favorites' && (
            favorites.length === 0 ? (
              <EmptyState compact icon="❤️" title="Nessun locale preferito" subtitle="Salva i locali che ami per ritrovarli qui." />
            ) : (
              favorites.map(f => <VenueRow key={f.venue_id} venue={f.venues} />)
            )
          )}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

function StatCell({ value, label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, alignItems: 'center', paddingVertical: 14, opacity: pressed ? 0.6 : 1 })}
    >
      <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>{value}</Text>
      <Text style={{ color: '#64748B', fontSize: 11, marginTop: 2 }}>{label}</Text>
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
