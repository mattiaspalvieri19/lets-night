import { useEffect, useState, useCallback, useLayoutEffect } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, Image } from 'react-native';
import { useLocalSearchParams, router, useFocusEffect, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';
import { COLORS, formatDate, formatTime, getPriceLabel } from '@lets-night/shared';
import EmptyState from '../../components/EmptyState';

const USER_TABS = [
  { id: 'going',      label: 'Andrà a' },
  { id: 'past',       label: 'È stato a' },
  { id: 'favorites',  label: 'Locali' },
];
const BUSINESS_TABS = [
  { id: 'future',   label: 'Prossimi' },
  { id: 'past_ev',  label: 'Storico' },
  { id: 'venue',    label: 'Il locale' },
  { id: 'contact',  label: 'Contatti' },
];

function initialOf(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
}

export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams();
  const { session } = useSession();
  const myId = session?.user?.id;
  const isOwn = myId === id;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ followers: 0, following: 0, badges: 0 });
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [tab, setTab] = useState('going');
  const [futureBookings, setFutureBookings] = useState([]);
  const [pastBookings, setPastBookings] = useState([]);
  const [favoriteVenues, setFavoriteVenues] = useState([]);
  // Business-specific
  const [bizVenue, setBizVenue] = useState(null);
  const [bizFutureEvents, setBizFutureEvents] = useState([]);
  const [bizPastEvents, setBizPastEvents] = useState([]);
  const [bizEventsCount, setBizEventsCount] = useState(0);


  async function loadAll() {
    // Profilo
    const { data: p } = await supabase
      .from('profiles')
      .select('id, display_name, full_name, username, bio, avatar_url, city, interests, loyalty_points, privacy_settings, role')
      .eq('id', id)
      .maybeSingle();
    setProfile(p);
    if (!p) return;
    // Tab di default coerente con il ruolo
    setTab(p.role === 'business' ? 'future' : 'going');

    // Followers/Following counts
    const [
      { count: followersCount, error: e1 },
      { count: followingCount, error: e2 },
      { count: badgesCount, error: e3 },
    ] = await Promise.all([
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', id),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', id),
      supabase.from('user_milestones').select('*', { count: 'exact', head: true }).eq('user_id', id).not('unlocked_at', 'is', null),
    ]);
    if (e1 || e2 || e3) console.error('Errore stats profilo:', e1 || e2 || e3);
    setStats({
      followers: followersCount || 0,
      following: followingCount || 0,
      badges: badgesCount || 0,
    });

    // Sto seguendo?
    let isFollowingNow = false;
    if (myId && myId !== id) {
      const { data: f } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('follower_id', myId)
        .eq('following_id', id)
        .maybeSingle();
      isFollowingNow = !!f;
      setIsFollowing(isFollowingNow);
    }
    // Gate dati: se private/followers e non lo segui, niente fetch
    const ps0 = p.privacy_settings || {};
    const profileBlocked = !isOwn && !isFollowingNow && (
      ps0.profile_visibility === 'private' || ps0.profile_visibility === 'followers'
    );

    // Eventi (filtra client-side: PostgREST non supporta filter su joined column)
    const ps = p.privacy_settings || {};
    const today = new Date().toISOString().split('T')[0];
    const wantsFuture = !profileBlocked && (ps.show_future_events !== false || isOwn);
    const wantsPast = !profileBlocked && (ps.show_past_events !== false || isOwn);
    if (wantsFuture || wantsPast) {
      const { data: all, error: bErr } = await supabase
        .from('bookings')
        .select('id, event_id, events(id, title, event_date, event_time, price, venues(name, zona, city))')
        .eq('user_id', id)
        .not('status', 'in', '("cancelled","denied")')
        .order('created_at', { ascending: false });
      if (bErr) console.error('Errore bookings profilo:', bErr);
      const list = (all || []).filter(b => b.events);
      setFutureBookings(wantsFuture ? list.filter(b => b.events.event_date >= today) : []);
      setPastBookings(wantsPast ? list.filter(b => b.events.event_date < today).slice(0, 20) : []);
    } else {
      setFutureBookings([]);
      setPastBookings([]);
    }

    // Locali preferiti (utenti normali)
    if (!profileBlocked && (ps.show_favorite_venues !== false || isOwn)) {
      const { data: favs, error: fErr } = await supabase
        .from('favorite_venues')
        .select('venue_id, venues(id, name, zona, city, category)')
        .eq('user_id', id);
      if (fErr) console.error('Errore favorites profilo:', fErr);
      setFavoriteVenues((favs || []).filter(f => f.venues));
    } else {
      setFavoriteVenues([]);
    }

    // Dati venue + eventi (solo per business)
    if (p.role === 'business') {
      const { data: venue } = await supabase
        .from('venues')
        .select('id, name, zona, city, address, category, description, phone, contact_email, website, instagram, is_verified, is_partner')
        .eq('owner_id', id)
        .maybeSingle();
      setBizVenue(venue);
      if (venue) {
        const [{ data: futureEvs, count }, { data: pastEvs }] = await Promise.all([
          supabase.from('events')
            .select('id, title, event_date, event_time, price, category, venues(name, zona, city)', { count: 'exact' })
            .eq('venue_id', venue.id).eq('is_active', true)
            .gte('event_date', today).order('event_date', { ascending: true }).limit(30),
          supabase.from('events')
            .select('id, title, event_date, event_time, price, category, venues(name, zona, city)')
            .eq('venue_id', venue.id).eq('is_active', true)
            .lt('event_date', today).order('event_date', { ascending: false }).limit(30),
        ]);
        setBizEventsCount(count || 0);
        setBizFutureEvents(futureEvs || []);
        setBizPastEvents(pastEvs || []);
      }
    }
  }

  useFocusEffect(useCallback(() => {
    setProfile(null);
    setTab('going');
    setFutureBookings([]);
    setPastBookings([]);
    setFavoriteVenues([]);
    setBizVenue(null);
    setBizFutureEvents([]);
    setBizPastEvents([]);
    setLoading(true);
    loadAll().finally(() => setLoading(false));
  }, [id, myId]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [id, myId]);

  async function toggleFollow() {
    if (!myId) { router.push('/auth/login'); return; }
    setFollowBusy(true);
    if (isFollowing) {
      const { error } = await supabase.from('follows').delete().eq('follower_id', myId).eq('following_id', id);
      if (!error) {
        setIsFollowing(false);
        setStats(s => ({ ...s, followers: Math.max(0, s.followers - 1) }));
      } else {
        console.error('Errore unfollow:', error);
      }
    } else {
      const { error } = await supabase.from('follows').insert({ follower_id: myId, following_id: id });
      if (!error) {
        setIsFollowing(true);
        setStats(s => ({ ...s, followers: s.followers + 1 }));
        supabase.functions.invoke('notify-follower', {
          body: { follower_id: myId, following_id: id },
        }).catch(() => {});
      } else {
        console.error('Errore follow:', error);
      }
    }
    setFollowBusy(false);
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#A855F7" size="large" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <EmptyState
          icon="🔍"
          title="Utente non trovato"
          subtitle="Il profilo che cerchi non esiste o è stato rimosso."
          actionLabel="Indietro"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  const ps = profile.privacy_settings || {};
  const isPrivate = ps.profile_visibility === 'private';
  const display = profile.display_name || profile.full_name || profile.username || 'Utente';
  const handle = profile.username ? `@${profile.username}` : null;
  const isBusiness = profile.role === 'business';
  const TABS = isBusiness ? BUSINESS_TABS : USER_TABS;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.bg }}
      stickyHeaderIndices={[0]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}
    >
      <View style={{ backgroundColor: COLORS.bg, paddingHorizontal: 20, paddingTop: 60, paddingBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))} hitSlop={10}>
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </View>
        </Pressable>
      </View>
      {/* Header */}
      <View style={{ padding: 20, paddingTop: 24, alignItems: 'center' }}>
        {profile?.avatar_url ? (
          <Image
            source={{ uri: profile.avatar_url }}
            style={{ width: 88, height: 88, borderRadius: 44, borderWidth: 2, borderColor: COLORS.brandBorder, marginBottom: 14 }}
          />
        ) : (
          <View style={{
            width: 88, height: 88, borderRadius: 44,
            backgroundColor: COLORS.brandSubtle,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 2, borderColor: COLORS.brandBorder,
            marginBottom: 14,
          }}>
            <Text style={{ color: COLORS.brand, fontSize: 38, fontWeight: '900' }}>{initialOf(display)}</Text>
          </View>
        )}
        <Text style={{ color: COLORS.textPrimary, fontSize: 22, fontWeight: '900' }}>{display}</Text>
        {handle && <Text style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 2 }}>{handle}</Text>}
        {profile.bio && (
          <Text style={{ color: COLORS.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 10, paddingHorizontal: 20 }}>
            {profile.bio}
          </Text>
        )}

        {/* Interests pills */}
        {Array.isArray(profile.interests) && profile.interests.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14, justifyContent: 'center' }}>
            {profile.interests.map(t => (
              <View key={t} style={{
                backgroundColor: COLORS.borderSubtle,
                borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4,
              }}>
                <Text style={{ color: COLORS.brand, fontSize: 11, fontWeight: '600' }}>{t}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Stats */}
        <View style={{ flexDirection: 'row', gap: 28, marginTop: 20 }}>
          {isBusiness ? (
            <>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: COLORS.textPrimary, fontSize: 17, fontWeight: '900' }}>{bizEventsCount}</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 2 }}>eventi</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: COLORS.textPrimary, fontSize: 17, fontWeight: '900' }}>{stats.followers}</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 2 }}>follower</Text>
              </View>
              {bizVenue?.is_verified && (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: COLORS.success, fontSize: 17, fontWeight: '900' }}>✓</Text>
                  <Text style={{ color: COLORS.success, fontSize: 11, marginTop: 2 }}>verificato</Text>
                </View>
              )}
            </>
          ) : (
            <>
              {(ps.show_followers !== false || isOwn) && (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: COLORS.textPrimary, fontSize: 17, fontWeight: '900' }}>{stats.followers}</Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 2 }}>follower</Text>
                </View>
              )}
              {(ps.show_following !== false || isOwn) && (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: COLORS.textPrimary, fontSize: 17, fontWeight: '900' }}>{stats.following}</Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 2 }}>seguiti</Text>
                </View>
              )}
            </>
          )}
        </View>

        {/* Follow button */}
        {!isOwn && (
          <Pressable
            onPress={toggleFollow}
            disabled={followBusy}
            style={({ pressed }) => ({
              marginTop: 18,
              paddingHorizontal: 36, paddingVertical: 12,
              borderRadius: 22,
              backgroundColor: isFollowing ? 'transparent' : COLORS.brandStrong,
              borderWidth: 1.5,
              borderColor: isFollowing ? COLORS.brandBorder : COLORS.brandStrong,
              opacity: followBusy || pressed ? 0.75 : 1,
              minWidth: 140,
              alignItems: 'center',
            })}
          >
            {followBusy ? (
              <ActivityIndicator color={isFollowing ? COLORS.brand : COLORS.textPrimary} />
            ) : (
              <Text style={{
                color: isFollowing ? COLORS.brand : COLORS.textPrimary,
                fontWeight: '700', fontSize: 14,
              }}>
                {isFollowing ? 'Segui già' : 'Segui'}
              </Text>
            )}
          </Pressable>
        )}
      </View>

      {/* Profilo privato */}
      {isPrivate && !isOwn && !isFollowing && (
        <View style={{ paddingHorizontal: 20, paddingBottom: 40 }}>
          <EmptyState
            icon="🔒"
            title="Profilo privato"
            subtitle="Solo i follower approvati possono vedere le attività di questo utente."
            compact
          />
        </View>
      )}

      {/* Tabs + contenuto */}
      {(!isPrivate || isOwn || isFollowing) && (
        <>
          <View style={{ flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.borderSubtle }}>
            {TABS.map(t => {
              const active = tab === t.id;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setTab(t.id)}
                  style={{
                    flex: 1, paddingVertical: 12, alignItems: 'center',
                    borderBottomWidth: 1,
                    borderBottomColor: active ? COLORS.brand : 'transparent',
                  }}
                >
                  <Text style={{
                    color: active ? COLORS.textPrimary : COLORS.textMuted,
                    fontSize: 11, fontWeight: active ? '600' : '500',
                    letterSpacing: 0.2,
                  }}>
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ padding: 20 }}>
            {/* USER TABS */}
            {!isBusiness && tab === 'going' && (
              futureBookings.length === 0
                ? <EmptyState compact icon="📅" title="Niente in calendario" subtitle="Niente eventi futuri condivisi." />
                : futureBookings.map(b => <BookingRow key={b.id} booking={b} />)
            )}
            {!isBusiness && tab === 'past' && (
              pastBookings.length === 0
                ? <EmptyState compact icon="🌙" title="Nessuna serata passata" subtitle="Niente eventi passati condivisi." />
                : pastBookings.map(b => <BookingRow key={b.id} booking={b} />)
            )}
            {!isBusiness && tab === 'favorites' && (
              favoriteVenues.length === 0
                ? <EmptyState compact icon="❤️" title="Nessun locale preferito" subtitle="I locali aggiunti ai preferiti appariranno qui." />
                : favoriteVenues.map(f => <VenueRow key={f.venue_id} venue={f.venues} />)
            )}

            {/* BUSINESS TABS */}
            {isBusiness && tab === 'future' && (
              bizFutureEvents.length === 0
                ? <EmptyState compact icon="🎉" title="Nessun evento in arrivo" subtitle="Questo locale non ha eventi futuri pubblicati." />
                : bizFutureEvents.map(e => <EventRow key={e.id} event={e} />)
            )}
            {isBusiness && tab === 'past_ev' && (
              bizPastEvents.length === 0
                ? <EmptyState compact icon="📅" title="Nessuno storico" subtitle="Nessun evento passato." />
                : bizPastEvents.map(e => <EventRow key={e.id} event={e} past />)
            )}
            {isBusiness && tab === 'venue' && (
              bizVenue
                ? <VenuePreview venue={bizVenue} />
                : <EmptyState compact icon="📍" title="Nessun locale associato" subtitle="Questo account non ha ancora un locale registrato." />
            )}
            {isBusiness && tab === 'contact' && (
              bizVenue
                ? <ContactInfo venue={bizVenue} />
                : <EmptyState compact icon="📞" title="Nessun contatto" subtitle="Informazioni di contatto non disponibili." />
            )}
          </View>
        </>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function BookingRow({ booking }) {
  const ev = booking.events;
  if (!ev) return null;
  return (
    <Pressable
      onPress={() => router.push(`/event/${ev.id}`)}
      style={({ pressed }) => ({
        backgroundColor: COLORS.bgElev2,
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: COLORS.borderSubtle,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ color: COLORS.brand, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>
        {ev.venues?.name || 'Locale'}
      </Text>
      <Text style={{ color: COLORS.textPrimary, fontSize: 15, fontWeight: '800' }} numberOfLines={1}>{ev.title}</Text>
      <Text style={{ color: COLORS.textSecondary, fontSize: 12, marginTop: 4 }}>
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
        backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 14, marginBottom: 10,
        borderWidth: 1, borderColor: COLORS.borderSubtle,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: COLORS.textPrimary, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>{venue.name}</Text>
        <Text style={{ color: COLORS.textSecondary, fontSize: 12, marginTop: 2 }}>
          {venue.category} · {venue.zona}, {venue.city}
        </Text>
      </View>
      <Text style={{ color: COLORS.brand, fontSize: 18 }}>›</Text>
    </Pressable>
  );
}

function EventRow({ event, past }) {
  if (!event) return null;
  return (
    <Pressable
      onPress={() => router.push(`/event/${event.id}`)}
      style={({ pressed }) => ({
        backgroundColor: COLORS.bgElev2,
        borderRadius: 12, padding: 14, marginBottom: 10,
        borderWidth: 1, borderColor: COLORS.borderSubtle,
        opacity: past ? 0.65 : (pressed ? 0.85 : 1),
      })}
    >
      <Text style={{ color: COLORS.brand, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>
        {event.category}
      </Text>
      <Text style={{ color: COLORS.textPrimary, fontSize: 15, fontWeight: '800' }} numberOfLines={2}>{event.title}</Text>
      <Text style={{ color: COLORS.textSecondary, fontSize: 12, marginTop: 4 }}>
        {formatDate(event.event_date)} · {formatTime(event.event_time) || '—'} · {getPriceLabel(event.price)}
      </Text>
    </Pressable>
  );
}

function VenuePreview({ venue }) {
  return (
    <Pressable
      onPress={() => router.push(`/venue/${venue.id}`)}
      style={({ pressed }) => ({
        backgroundColor: COLORS.bgElev2, borderRadius: 14, padding: 18,
        borderWidth: 1, borderColor: COLORS.borderSubtle,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {venue.is_partner && (
          <View style={{ backgroundColor: COLORS.brandSubtle, borderWidth: 1, borderColor: COLORS.brandBorder, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 }}>
            <Text style={{ color: COLORS.brand, fontSize: 10, fontWeight: '800' }}>★ PARTNER</Text>
          </View>
        )}
        {venue.is_verified && (
          <View style={{ backgroundColor: 'rgba(34,197,94,0.12)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.4)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 }}>
            <Text style={{ color: COLORS.success, fontSize: 10, fontWeight: '800' }}>✓ VERIFICATO</Text>
          </View>
        )}
      </View>
      <Text style={{ color: COLORS.textPrimary, fontSize: 22, fontWeight: '900' }}>{venue.name}</Text>
      <Text style={{ color: COLORS.brand, fontSize: 13, marginTop: 4 }}>{venue.category}</Text>
      <Text style={{ color: COLORS.textSecondary, fontSize: 13, marginTop: 8 }}>📍 {venue.zona}, {venue.city}</Text>
      {venue.address && <Text style={{ color: COLORS.textSecondary, fontSize: 12, marginTop: 4 }}>{venue.address}</Text>}
      {venue.description && (
        <Text style={{ color: COLORS.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 12 }}>
          {venue.description}
        </Text>
      )}
      <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: COLORS.borderSubtle, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: COLORS.brand, fontWeight: '700', fontSize: 13 }}>Apri pagina locale</Text>
        <Text style={{ color: COLORS.brand, fontSize: 18 }}>›</Text>
      </View>
    </Pressable>
  );
}

function ContactInfo({ venue }) {
  const items = [
    venue.phone        && { icon: '📞', label: 'Telefono', value: venue.phone },
    venue.contact_email&& { icon: '✉️', label: 'Email',    value: venue.contact_email },
    venue.address      && { icon: '📍', label: 'Indirizzo', value: `${venue.address}\n${venue.zona}, ${venue.city}` },
    venue.website      && { icon: '🌐', label: 'Sito web',  value: venue.website },
    venue.instagram    && { icon: '📷', label: 'Instagram', value: venue.instagram },
  ].filter(Boolean);

  if (items.length === 0) {
    return <EmptyState compact icon="📞" title="Nessun contatto pubblico" subtitle="Il locale non ha condiviso informazioni di contatto." />;
  }
  return (
    <View>
      {items.map((it, i) => (
        <View key={i} style={{
          backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 14, marginBottom: 10,
          borderWidth: 1, borderColor: COLORS.borderSubtle,
          flexDirection: 'row', alignItems: 'flex-start', gap: 12,
        }}>
          <Text style={{ fontSize: 22 }}>{it.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.textMuted, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3 }}>{it.label}</Text>
            <Text style={{ color: COLORS.textPrimary, fontSize: 14, fontWeight: '600' }} selectable>{it.value}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}
