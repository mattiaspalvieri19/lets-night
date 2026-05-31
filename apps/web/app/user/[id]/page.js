'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { formatDate, formatTime, getPriceLabel } from '@lets-night/shared';

const TABS = [
  { id: 'going',     label: 'Andrà a' },
  { id: 'past',      label: 'È stato a' },
  { id: 'favorites', label: 'Locali' },
  { id: 'badges',    label: 'Badge' },
];

function initialOf(name) { return (name || '?').trim().charAt(0).toUpperCase(); }

export default function PublicProfilePage({ params }) {
  const { id } = use(params);
  const [myId, setMyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ followers: 0, following: 0, badges: 0 });
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [tab, setTab] = useState('going');
  const [futureBookings, setFutureBookings] = useState([]);
  const [pastBookings, setPastBookings] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [unlockedBadges, setUnlockedBadges] = useState([]);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id || null;
      setMyId(uid);

      const { data: p } = await supabase
        .from('profiles')
        .select('id, display_name, full_name, username, bio, city, interests, loyalty_level, loyalty_points, privacy_settings, role')
        .eq('id', id).maybeSingle();
      setProfile(p);
      if (!p) { setLoading(false); return; }

      const [{ count: fc }, { count: fgc }, { count: bc }] = await Promise.all([
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', id),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', id),
        supabase.from('user_milestones').select('*', { count: 'exact', head: true }).eq('user_id', id).not('unlocked_at', 'is', null),
      ]);
      setStats({ followers: fc || 0, following: fgc || 0, badges: bc || 0 });

      if (uid && uid !== id) {
        const { data: f } = await supabase.from('follows').select('follower_id')
          .eq('follower_id', uid).eq('following_id', id).maybeSingle();
        setIsFollowing(!!f);
      }

      const ps = p.privacy_settings || {};
      const today = new Date().toISOString().split('T')[0];
      const isOwn = uid === id;
      const wantsFuture = ps.show_future_events !== false || isOwn;
      const wantsPast = ps.show_past_events !== false || isOwn;
      // PostgREST non supporta filter su joined column: filtra client-side
      if (wantsFuture || wantsPast) {
        const { data: all } = await supabase
          .from('bookings')
          .select('id, event_id, events(id, title, event_date, event_time, price, venues(name, zona, city))')
          .eq('user_id', id).neq('status', 'cancelled');
        const list = (all || []).filter(b => b.events);
        if (wantsFuture) setFutureBookings(list.filter(b => b.events.event_date >= today));
        if (wantsPast) setPastBookings(list.filter(b => b.events.event_date < today).slice(0, 20));
      }
      if (ps.show_favorite_venues !== false || isOwn) {
        const { data: favs } = await supabase
          .from('favorite_venues').select('venue_id, venues(id, name, zona, city, category)')
          .eq('user_id', id);
        setFavorites((favs || []).filter(f => f.venues));
      }
      if (ps.show_badges !== false || isOwn) {
        const { data: ums } = await supabase
          .from('user_milestones')
          .select('loyalty_milestones(*)').eq('user_id', id).not('unlocked_at', 'is', null);
        setUnlockedBadges((ums || []).map(r => r.loyalty_milestones).filter(Boolean));
      }

      setLoading(false);
    }
    load();
  }, [id]);

  async function toggleFollow() {
    if (!myId) { window.location.href = '/login?next=/user/' + id; return; }
    setFollowBusy(true);
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', myId).eq('following_id', id);
      setIsFollowing(false);
      setStats(s => ({ ...s, followers: Math.max(0, s.followers - 1) }));
    } else {
      await supabase.from('follows').insert({ follower_id: myId, following_id: id });
      setIsFollowing(true);
      setStats(s => ({ ...s, followers: s.followers + 1 }));
    }
    setFollowBusy(false);
  }

  if (loading) return <div className="dash-loading">Caricamento profilo...</div>;
  if (!profile) return <div className="dash-loading">Utente non trovato. <Link href="/search">Torna alla ricerca</Link></div>;

  const ps = profile.privacy_settings || {};
  const isOwn = myId === id;
  // Profilo bloccato sia per "private" che per "followers" (se non lo segui)
  const isPrivate = !isOwn && !isFollowing && (
    ps.profile_visibility === 'private' || ps.profile_visibility === 'followers'
  );
  const display = profile.display_name || profile.full_name || profile.username || 'Utente';
  const handle = profile.username ? `@${profile.username}` : null;

  return (
    <div className="profile-pub">
      <nav className="lnav solid">
        <Link href="/" className="ln-logo">Let&apos;s<span>Night</span></Link>
        <div className="ln-menu">
          <Link href="/explore">Esplora</Link>
          <Link href="/search">Cerca</Link>
          <Link href="/dashboard">Profilo</Link>
        </div>
      </nav>

      <div className="profile-pub-container">
        <div className="profile-pub-head">
          <div className="user-avatar user-avatar-lg">{initialOf(display)}</div>
          <h1 className="profile-pub-name">{display}</h1>
          {handle && <div className="profile-pub-handle">{handle}</div>}
          {profile.bio && <p className="profile-pub-bio">{profile.bio}</p>}
          {profile.city && <div className="profile-pub-city">📍 {profile.city}</div>}

          {Array.isArray(profile.interests) && profile.interests.length > 0 && (
            <div className="user-tags" style={{ justifyContent: 'center', marginTop: 14 }}>
              {profile.interests.map(t => <span key={t} className="user-tag">{t}</span>)}
            </div>
          )}

          <div className="profile-pub-stats">
            {(ps.show_followers !== false || isOwn) && (
              <div className="profile-pub-stat"><strong>{stats.followers}</strong><span>follower</span></div>
            )}
            {(ps.show_following !== false || isOwn) && (
              <div className="profile-pub-stat"><strong>{stats.following}</strong><span>seguiti</span></div>
            )}
            {(ps.show_badges !== false || isOwn) && (
              <div className="profile-pub-stat"><strong>{stats.badges}</strong><span>badge</span></div>
            )}
          </div>

          {!isOwn && (
            <button onClick={toggleFollow} disabled={followBusy}
              className={`user-follow-btn ${isFollowing ? 'following' : ''}`}
              style={{ padding: '10px 32px', fontSize: 13 }}>
              {followBusy ? '...' : (isFollowing ? 'Segui già' : 'Segui')}
            </button>
          )}
        </div>

        {isPrivate ? (
          <div className="empty">
            <div className="empty-icon">🔒</div>
            <div className="empty-title">Profilo privato</div>
            <div className="empty-sub">Solo i follower approvati possono vedere le attività di questo utente.</div>
          </div>
        ) : (
          <>
            <div className="profile-pub-tabs">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`profile-pub-tab ${tab === t.id ? 'active' : ''}`}>
                  {t.label}
                </button>
              ))}
            </div>

            <div style={{ paddingTop: 24 }}>
              {tab === 'going' && (
                futureBookings.length === 0 ? <Empty icon="📅" title="Niente in calendario" sub="Nessun evento futuro condiviso." />
                : futureBookings.map(b => <BookingRow key={b.id} b={b} />))}
              {tab === 'past' && (
                pastBookings.length === 0 ? <Empty icon="🌙" title="Nessuna serata passata" sub="Nessun evento passato condiviso." />
                : pastBookings.map(b => <BookingRow key={b.id} b={b} />))}
              {tab === 'favorites' && (
                favorites.length === 0 ? <Empty icon="❤️" title="Nessun locale preferito" sub="I locali aggiunti ai preferiti appariranno qui." />
                : favorites.map(f => <VenueRow key={f.venue_id} v={f.venues} />))}
              {tab === 'badges' && (
                unlockedBadges.length === 0 ? <Empty icon="🏆" title="Nessun badge ancora" sub="L'utente non ha ancora sbloccato nessun traguardo." />
                : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
                    {unlockedBadges.map(m => (
                      <div key={m.id} style={{
                        textAlign: 'center', padding: '20px 12px',
                        background: 'var(--dark2)', border: '1px solid rgba(168,85,247,.25)', borderRadius: 12,
                      }}>
                        <div style={{ fontSize: 32, marginBottom: 6 }}>{m.icon || '🏆'}</div>
                        <div style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>{m.title}</div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Empty({ icon, title, sub }) {
  return <div className="empty"><div className="empty-icon">{icon}</div><div className="empty-title">{title}</div><div className="empty-sub">{sub}</div></div>;
}

function BookingRow({ b }) {
  const ev = b.events;
  if (!ev) return null;
  return (
    <Link href={`/event/${ev.id}`} className="user-card" style={{ marginBottom: 10, padding: 14 }}>
      <div style={{ flex: 1 }}>
        <div style={{ color: 'var(--purple-light)', fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase' }}>
          {ev.venues?.name || 'Locale'}
        </div>
        <div style={{ color: '#fff', fontSize: 15, fontWeight: 800, marginTop: 4 }}>{ev.title}</div>
        <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 4 }}>
          {formatDate(ev.event_date)} · {formatTime(ev.event_time) || '—'} · {getPriceLabel(ev.price)}
        </div>
      </div>
    </Link>
  );
}

function VenueRow({ v }) {
  if (!v) return null;
  return (
    <Link href={`/venue/${v.id}`} className="user-card" style={{ marginBottom: 10, padding: 14 }}>
      <div style={{ flex: 1 }}>
        <div style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>{v.name}</div>
        <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 2 }}>{v.category} · {v.zona}, {v.city}</div>
      </div>
      <span style={{ color: 'var(--purple-light)', fontSize: 18 }}>›</span>
    </Link>
  );
}
