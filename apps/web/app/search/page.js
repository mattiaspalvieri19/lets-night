'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { formatDate, formatTime, getPriceLabel } from '@lets-night/shared';
import Navbar from '../../components/Navbar';

const ENTITY_TABS = [
  { id: 'users',  label: 'Utenti' },
  { id: 'venues', label: 'Locali' },
  { id: 'events', label: 'Eventi' },
];

function normalize(s) { return (s || '').trim().toLowerCase(); }
function initialOf(name) { return (name || '?').trim().charAt(0).toUpperCase(); }

export default function SearchPage() {
  const [myId, setMyId] = useState(null);
  const [users, setUsers] = useState([]);
  const [venues, setVenues] = useState([]);
  const [events, setEvents] = useState([]);
  const [followingIds, setFollowingIds] = useState(new Set());
  const [busyId, setBusyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('users');
  const [q, setQ] = useState('');

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id || null;
      setMyId(uid);

      const today = new Date().toISOString().split('T')[0];
      const [usersRes, venuesRes, eventsRes, followsRes] = await Promise.all([
        supabase.from('profiles')
          .select('id, display_name, full_name, username, bio, avatar_url, city, interests, privacy_settings, role')
          .or('role.eq.user,role.is.null')
          .limit(80),
        supabase.from('venues')
          .select('id, name, category, city, zona, description, is_verified, is_partner')
          .eq('is_verified', true)
          .order('name', { ascending: true })
          .limit(80),
        supabase.from('events')
          .select('id, title, category, event_date, event_time, price, venues(name, zona, city)')
          .eq('is_active', true)
          .gte('event_date', today)
          .order('event_date', { ascending: true })
          .limit(80),
        uid
          ? supabase.from('follows').select('following_id').eq('follower_id', uid)
          : Promise.resolve({ data: [] }),
      ]);

      const visibleUsers = (usersRes.data || []).filter(u =>
        u.id !== uid && (u.privacy_settings || {}).searchable !== false
      );
      setUsers(visibleUsers);
      setVenues(venuesRes.data || []);
      setEvents(eventsRes.data || []);
      setFollowingIds(new Set((followsRes.data || []).map(r => r.following_id)));
      setLoading(false);
    }
    load();
  }, []);

  async function toggleFollow(targetId) {
    if (!myId) { window.location.href = '/login?next=/search'; return; }
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

  const lower = normalize(q);

  const filteredUsers = useMemo(() => {
    if (!lower) return users;
    return users.filter(u => {
      const hay = `${u.display_name || ''} ${u.full_name || ''} ${u.username || ''} ${u.bio || ''} ${u.city || ''} ${(u.interests || []).join(' ')}`.toLowerCase();
      return hay.includes(lower);
    });
  }, [users, lower]);

  const filteredVenues = useMemo(() => {
    if (!lower) return venues;
    return venues.filter(v => {
      const hay = `${v.name || ''} ${v.category || ''} ${v.city || ''} ${v.zona || ''} ${v.description || ''}`.toLowerCase();
      return hay.includes(lower);
    });
  }, [venues, lower]);

  const filteredEvents = useMemo(() => {
    if (!lower) return events;
    return events.filter(e => {
      const hay = `${e.title || ''} ${e.category || ''} ${e.venues?.name || ''} ${e.venues?.zona || ''} ${e.venues?.city || ''}`.toLowerCase();
      return hay.includes(lower);
    });
  }, [events, lower]);

  const counts = {
    users: filteredUsers.length,
    venues: filteredVenues.length,
    events: filteredEvents.length,
  };

  return (
    <div className="search-page">
      <Navbar />
      <div className="search-container">
        <div className="search-hero">
          <h1>Cerca</h1>
          <p>Utenti, locali ed eventi a Milano</p>
        </div>

        <div className="search-bar">
          <span>🔍</span>
          <input
            type="text" value={q} onChange={e => setQ(e.target.value)}
            placeholder={tab === 'users' ? 'Cerca utenti...' : tab === 'venues' ? 'Cerca locali...' : 'Cerca eventi...'} />
          {q && <button onClick={() => setQ('')} style={{ background: 'transparent', border: 0, color: '#64748B', fontSize: 18, cursor: 'pointer' }}>×</button>}
        </div>

        {/* Tabs entity */}
        <div style={{ display: 'flex', borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)', marginBottom: '1.5rem' }}>
          {ENTITY_TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                flex: 1, padding: '12px', textAlign: 'center', cursor: 'pointer',
                background: 'transparent', border: 0,
                borderBottom: '1px solid ' + (tab === t.id ? '#A855F7' : 'transparent'),
                color: tab === t.id ? '#fff' : '#64748B',
                fontSize: 12, fontWeight: tab === t.id ? 600 : 500,
                letterSpacing: 0.2, fontFamily: 'inherit',
              }}>
              {t.label} <span style={{ color: '#475569', fontWeight: 500 }}>({counts[t.id]})</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="dash-loading">Caricamento...</div>
        ) : (
          <>
            {tab === 'users' && (
              filteredUsers.length === 0 ? (
                <div className="empty">
                  <div className="empty-title">{q ? 'Nessun utente trovato' : 'Nessun utente'}</div>
                  <div className="empty-sub">{q ? 'Prova un altro nome o username.' : 'La community è in crescita.'}</div>
                  {q && <button onClick={() => setQ('')} className="ln-btn-primary">Reset</button>}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {filteredUsers.map(u => {
                    const display = u.display_name || u.full_name || u.username || 'Utente';
                    const handle = u.username ? `@${u.username}` : null;
                    const isFollowing = followingIds.has(u.id);
                    return (
                      <div key={u.id} className="user-card">
                        <Link href={`/user/${u.id}`} className="user-avatar" style={{ textDecoration: 'none' }}>
                          {initialOf(display)}
                        </Link>
                        <div className="user-info">
                          <Link href={`/user/${u.id}`} style={{ textDecoration: 'none' }}>
                            <div className="user-name">{display}</div>
                            {handle && <div className="user-handle">{handle}</div>}
                            {u.bio && <div className="user-bio">{u.bio}</div>}
                          </Link>
                          {Array.isArray(u.interests) && u.interests.length > 0 && (
                            <div className="user-tags">
                              {u.interests.slice(0, 3).map(t => <span key={t} className="user-tag">{t}</span>)}
                            </div>
                          )}
                        </div>
                        {myId && (
                          <button
                            onClick={() => toggleFollow(u.id)}
                            disabled={busyId === u.id}
                            className={`user-follow-btn ${isFollowing ? 'following' : ''}`}>
                            {busyId === u.id ? '...' : (isFollowing ? 'Segui già' : 'Segui')}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {tab === 'venues' && (
              filteredVenues.length === 0 ? (
                <div className="empty">
                  <div className="empty-title">{q ? 'Nessun locale trovato' : 'Nessun locale'}</div>
                  <div className="empty-sub">{q ? 'Prova un altro nome, zona o categoria.' : 'Nessun locale verificato.'}</div>
                  {q && <button onClick={() => setQ('')} className="ln-btn-primary">Reset</button>}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                  {filteredVenues.map(v => (
                    <Link key={v.id} href={`/venue/${v.id}`} className="search-card">
                      <div className="search-card-meta">
                        <span className="search-card-cat">{v.category}</span>
                        {v.is_partner && <span className="search-card-badge">PARTNER</span>}
                      </div>
                      <div className="search-card-title">{v.name}</div>
                      <div className="search-card-sub">{v.zona}, {v.city}</div>
                      {v.description && <div className="search-card-desc">{v.description}</div>}
                    </Link>
                  ))}
                </div>
              )
            )}

            {tab === 'events' && (
              filteredEvents.length === 0 ? (
                <div className="empty">
                  <div className="empty-title">{q ? 'Nessun evento trovato' : 'Nessun evento'}</div>
                  <div className="empty-sub">{q ? 'Prova un altro nome di evento o locale.' : 'Nessun evento in programma.'}</div>
                  {q && <button onClick={() => setQ('')} className="ln-btn-primary">Reset</button>}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                  {filteredEvents.map(e => (
                    <Link key={e.id} href={`/event/${e.id}`} className="search-card">
                      <div className="search-card-meta">
                        <span className="search-card-cat">{e.category}</span>
                      </div>
                      <div className="search-card-title">{e.title}</div>
                      <div className="search-card-sub">{e.venues?.name} · {e.venues?.zona}, {e.venues?.city}</div>
                      <div className="search-card-footer">
                        <span>{formatDate(e.event_date)} · {formatTime(e.event_time) || '—'}</span>
                        <strong>{getPriceLabel(e.price)}</strong>
                      </div>
                    </Link>
                  ))}
                </div>
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}
