'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import QRCode from 'react-qr-code';
import { supabase } from '../../lib/supabase';
import { formatDateFull, formatTime, getLoyaltyLevel } from '@lets-night/shared';

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const TABS = [
  { id: 'going',     label: 'Andrò a' },
  { id: 'past',      label: 'Sono stato a' },
  { id: 'favorites', label: 'Locali' },
  { id: 'badges',    label: 'Badge' },
];

function initialOf(n) { return (n || '?').trim().charAt(0).toUpperCase(); }

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [unlockedBadges, setUnlockedBadges] = useState([]);
  const [stats, setStats] = useState({ followers: 0, following: 0 });
  const [openQR, setOpenQR] = useState(null);
  const [tab, setTab] = useState('going');

  useEffect(() => {
    async function loadData() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }
      setUser(session.user);
      const uid = session.user.id;

      const [
        { data: profileData },
        { data: bookingsData },
        { count: followersCount },
        { count: followingCount },
        { data: favs },
        { data: ums },
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', uid).single(),
        supabase.from('bookings')
          .select('*, events(id, title, event_date, event_time, price, venues(name, zona, city))')
          .eq('user_id', uid).order('created_at', { ascending: false }),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', uid),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', uid),
        supabase.from('favorite_venues').select('venue_id, venues(id, name, zona, city, category)').eq('user_id', uid),
        supabase.from('user_milestones').select('loyalty_milestones(*)').eq('user_id', uid).not('unlocked_at', 'is', null),
      ]);

      if (profileData?.role === 'business') { router.push('/business/dashboard'); return; }

      setProfile(profileData);
      setBookings(bookingsData || []);
      setStats({ followers: followersCount || 0, following: followingCount || 0 });
      setFavorites((favs || []).filter(f => f.venues));
      setUnlockedBadges((ums || []).map(r => r.loyalty_milestones).filter(Boolean));
      setLoading(false);
    }
    loadData();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
  }

  if (loading) return <div className="dash-loading">Caricamento...</div>;

  const display = profile?.display_name || profile?.full_name || user?.email?.split('@')[0] || 'Utente';
  const handle = profile?.username ? `@${profile.username}` : null;
  const today = todayLocal();
  const upcoming = bookings.filter(b => b.events && b.events.event_date >= today && b.status !== 'cancelled');
  const past = bookings.filter(b => b.events && (b.events.event_date < today || b.status === 'cancelled'));
  const ll = getLoyaltyLevel(profile?.loyalty_points || 0);

  return (
    <div className="dash-page">
      <nav className="lnav solid">
        <Link href="/" className="ln-logo">Let&apos;s<span>Night</span></Link>
        <div className="ln-menu">
          <Link href="/explore">Esplora</Link>
          <Link href="/search">Cerca</Link>
          <Link href="/loyalty">Fedeltà</Link>
        </div>
      </nav>

      {/* Hero social */}
      <div className="dash-hero" style={{ textAlign: 'center', paddingTop: '5rem' }}>
        <div className="user-avatar user-avatar-lg" style={{ margin: '0 auto 1rem' }}>{initialOf(display)}</div>
        <h1 className="dash-title" style={{ marginBottom: 4 }}>{display}</h1>
        {handle && <div style={{ color: 'var(--text2)', fontSize: 14 }}>{handle}</div>}
        {profile?.bio && (
          <p style={{ color: '#9ca3af', maxWidth: 500, margin: '12px auto', lineHeight: 1.5 }}>{profile.bio}</p>
        )}
        {profile?.city && (
          <div style={{ color: 'var(--purple-light)', fontWeight: 600, marginTop: 6 }}>📍 {profile.city}</div>
        )}
        {Array.isArray(profile?.interests) && profile.interests.length > 0 && (
          <div className="user-tags" style={{ justifyContent: 'center', marginTop: 14 }}>
            {profile.interests.map(t => <span key={t} className="user-tag">{t}</span>)}
          </div>
        )}

        <div className="profile-pub-stats" style={{ justifyContent: 'center', marginTop: 18 }}>
          <div className="profile-pub-stat"><strong>{bookings.length}</strong><span>prenotazioni</span></div>
          <div className="profile-pub-stat"><strong>{bookings.filter(b => b.status === 'confirmed').length}</strong><span>confermate</span></div>
          <div className="profile-pub-stat"><strong>{stats.followers}</strong><span>follower</span></div>
          <div className="profile-pub-stat"><strong>{stats.following}</strong><span>seguiti</span></div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
          <Link href="/settings/profile" className="ln-btn-primary" style={{ textDecoration: 'none' }}>Modifica profilo</Link>
          <Link href="/settings/privacy" className="ln-btn-ghost" style={{ textDecoration: 'none' }}>Privacy</Link>
        </div>
      </div>

      <div className="dash-grid">
        <div className="dash-main">
          {/* Tabs */}
          <div className="dash-section">
            <div className="dash-tabs">
              {TABS.map(t => (
                <button key={t.id} className={`dash-tab ${tab === t.id ? 'active' : ''}`}
                  onClick={() => setTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'going' && (
              upcoming.length === 0 ? (
                <div className="dash-empty">
                  <p>Nessuna prenotazione in arrivo.</p>
                  <Link href="/explore" className="ln-btn-primary">Scopri gli eventi</Link>
                </div>
              ) : (
                <div className="dash-bookings">
                  {upcoming.map(b => (
                    <div key={b.id} className="dash-booking">
                      <div className="dash-booking-info">
                        <h3>{b.events?.title}</h3>
                        <p>{b.events?.venues?.name} - {b.events?.venues?.city}</p>
                        <span className="dash-booking-date">{formatDateFull(b.events?.event_date)} alle {formatTime(b.events?.event_time)}</span>
                      </div>
                      <div className="dash-booking-status">
                        <span className={'dash-status dash-status-' + b.status}>{b.status}</span>
                        <strong>EUR {b.total_price}</strong>
                        {b.qr_code && (
                          <button onClick={() => setOpenQR(b)} className="ln-btn-ghost" style={{ marginTop: 8, fontSize: 12 }}>Mostra QR</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {tab === 'past' && (
              past.length === 0 ? (
                <div className="dash-empty"><p>Le tue serate passate appariranno qui.</p></div>
              ) : (
                <div className="dash-bookings">
                  {past.map(b => (
                    <div key={b.id} className="dash-booking" style={{ opacity: 0.7 }}>
                      <div className="dash-booking-info">
                        <h3>{b.events?.title}</h3>
                        <p>{b.events?.venues?.name} - {b.events?.venues?.city}</p>
                        <span className="dash-booking-date">{formatDateFull(b.events?.event_date)}</span>
                      </div>
                      <div className="dash-booking-status">
                        <span className={'dash-status dash-status-' + b.status}>{b.status === 'cancelled' ? 'annullato' : 'passato'}</span>
                        <strong>EUR {b.total_price}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {tab === 'favorites' && (
              favorites.length === 0 ? (
                <div className="dash-empty"><p>Nessun locale preferito. Salvali per ritrovarli qui.</p></div>
              ) : (
                <div className="dash-bookings">
                  {favorites.map(f => (
                    <Link key={f.venue_id} href={`/venue/${f.venues.id}`} className="dash-booking" style={{ textDecoration: 'none' }}>
                      <div className="dash-booking-info">
                        <h3>{f.venues.name}</h3>
                        <p>{f.venues.category} - {f.venues.zona}, {f.venues.city}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )
            )}

            {tab === 'badges' && (
              unlockedBadges.length === 0 ? (
                <div className="dash-empty">
                  <p>Ancora nessun badge sbloccato.</p>
                  <Link href="/loyalty" className="ln-btn-primary">Vedi traguardi</Link>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
                  {unlockedBadges.map(m => (
                    <div key={m.id} style={{
                      textAlign: 'center', padding: '20px 12px',
                      background: 'var(--dark3)', border: '1px solid rgba(168,85,247,.25)', borderRadius: 12,
                    }}>
                      <div style={{ fontSize: 32, marginBottom: 6 }}>{m.icon || '🏆'}</div>
                      <div style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>{m.title}</div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>

        <aside className="dash-aside">
          {/* Loyalty block */}
          <Link href="/loyalty" className="loyalty-block">
            <div className="loyalty-block-head">
              <div>
                <div className="loyalty-block-eyebrow">La tua carta fedeltà</div>
                <div className="loyalty-block-points">{profile?.loyalty_points || 0}<small>punti</small></div>
                <div style={{ color: ll.level.color, fontWeight: 700, fontSize: 13, marginTop: 4 }}>
                  {ll.level.icon} {ll.level.name}
                </div>
              </div>
              <div className="loyalty-block-cta">Vedi →</div>
            </div>
            <div className="loyalty-progress" style={{ marginTop: 14 }}>
              <div className="loyalty-progress-bar" style={{ width: `${Math.round(ll.progress * 100)}%` }} />
            </div>
            <div style={{ color: '#9ca3af', fontSize: 11, marginTop: 8 }}>
              {ll.next ? `${ll.pointsToNext} punti al livello ${ll.next.name}` : 'Livello massimo'}
            </div>
          </Link>

          <div className="dash-card">
            <h3 className="dash-card-title">Account</h3>
            <div className="dash-info">
              <div><span>Email</span><strong>{user?.email}</strong></div>
              <div><span>Telefono</span><strong>{profile?.phone || '-'}</strong></div>
            </div>
            <button onClick={handleLogout} style={{
              background: 'transparent', border: 0, color: 'var(--text2)',
              fontSize: 13, textDecoration: 'underline', cursor: 'pointer',
              marginTop: 14, padding: 0,
            }}>
              Esci dall&apos;account
            </button>
          </div>
        </aside>
      </div>

      {openQR && (
        <div className="book-modal-overlay" onClick={() => setOpenQR(null)}>
          <div className="book-modal" onClick={e => e.stopPropagation()}>
            <div className="book-modal-head">
              <div>
                <div className="book-modal-eyebrow">Il tuo biglietto</div>
                <h2 className="book-modal-title">{openQR.events?.title}</h2>
                <p className="book-modal-venue">{formatDateFull(openQR.events?.event_date)}</p>
              </div>
              <button onClick={() => setOpenQR(null)} className="book-modal-close" aria-label="Chiudi">×</button>
            </div>
            <div className="ticket-qr-wrap">
              <div className="ticket-qr-inner">
                <QRCode value={openQR.qr_code} size={220} />
              </div>
              <p className="ticket-qr-hint">Mostra questo QR code all&apos;ingresso</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
