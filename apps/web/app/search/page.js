'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import Navbar from '../../components/Navbar';

const SOCIAL_FILTERS = [
  { id: 'all',         label: 'Tutti' },
  { id: 'following',   label: 'Già segui' },
  { id: 'same_city',   label: 'Vicino a te' },
  { id: 'university',  label: 'Universitari' },
  { id: 'aperitivo',   label: 'Ama aperitivi' },
  { id: 'vip',         label: 'VIP' },
];

function initialOf(name) { return (name || '?').trim().charAt(0).toUpperCase(); }

export default function SearchUsersPage() {
  const [myId, setMyId] = useState(null);
  const [myCity, setMyCity] = useState(null);
  const [users, setUsers] = useState([]);
  const [followingIds, setFollowingIds] = useState(new Set());
  const [busyId, setBusyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id || null;
      setMyId(uid);

      if (uid) {
        const { data: prof } = await supabase.from('profiles').select('city').eq('id', uid).maybeSingle();
        setMyCity(prof?.city || null);
        const { data: fol } = await supabase.from('follows').select('following_id').eq('follower_id', uid);
        setFollowingIds(new Set((fol || []).map(f => f.following_id)));
      }

      let query = supabase
        .from('profiles')
        .select('id, display_name, full_name, username, bio, avatar_url, city, interests, privacy_settings, role')
        .in('role', ['user', 'business'])  // include i business ma esclude eventuali role NULL
        .limit(80);
      if (uid) query = query.neq('id', uid);
      const { data } = await query;
      const visible = (data || []).filter(u => (u.privacy_settings || {}).searchable !== false);
      setUsers(visible);
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

  const filtered = useMemo(() => {
    const lower = q.trim().toLowerCase();
    return users.filter(u => {
      if (lower) {
        const hay = `${u.display_name || ''} ${u.full_name || ''} ${u.username || ''} ${u.bio || ''}`.toLowerCase();
        if (!hay.includes(lower)) return false;
      }
      if (filter === 'following' && !followingIds.has(u.id)) return false;
      if (filter === 'same_city' && myCity && u.city !== myCity) return false;
      if (filter === 'university' && !(u.interests || []).map(s => s.toLowerCase()).includes('universitario')) return false;
      if (filter === 'aperitivo' && !(u.interests || []).map(s => s.toLowerCase()).includes('aperitivo')) return false;
      if (filter === 'vip' && !(u.interests || []).map(s => s.toLowerCase()).includes('vip')) return false;
      return true;
    });
  }, [users, q, filter, followingIds, myCity]);

  return (
    <div className="search-page">
      <Navbar />

      <div className="search-container">
        <div className="search-hero">
          <h1>Cerca</h1>
          <p>Trova persone con cui vivere la serata</p>
        </div>

        <div className="search-bar">
          <span>🔍</span>
          <input
            type="text" value={q} onChange={e => setQ(e.target.value)}
            placeholder="Cerca utenti..." />
          {q && <button onClick={() => setQ('')} style={{ background: 'transparent', border: 0, color: '#64748B', fontSize: 18, cursor: 'pointer' }}>×</button>}
        </div>

        <div className="search-chips">
          {SOCIAL_FILTERS.map(f => {
            const disabled =
              ((f.id === 'following' || f.id === 'same_city') && !myId) ||
              (f.id === 'same_city' && !myCity);
            return (
              <button key={f.id} disabled={disabled}
                onClick={() => !disabled && setFilter(f.id)}
                className={`search-chip ${filter === f.id ? 'active' : ''}`}>
                {f.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="dash-loading">Caricamento...</div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">🌃</div>
            <div className="empty-title">{q ? 'Nessun utente trovato' : 'Nessuno qui per ora'}</div>
            <div className="empty-sub">{q ? 'Prova un altro nome o username.' : 'La community è in crescita: torna più tardi.'}</div>
            {q && <button onClick={() => setQ('')} className="ln-btn-primary">Resetta ricerca</button>}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(u => {
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
        )}
      </div>
    </div>
  );
}
