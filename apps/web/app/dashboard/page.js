'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [bookings, setBookings] = useState([]);

  useEffect(() => {
    async function loadData() {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        router.push('/login');
        return;
      }

      setUser(session.user);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      // Se e un business, reindirizza
      if (profileData?.role === 'business') {
        router.push('/business/dashboard');
        return;
      }

      setProfile(profileData);

      const { data: bookingsData } = await supabase
        .from('bookings')
        .select('*, events(title, event_date, event_time, venues(name, city))')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      setBookings(bookingsData || []);
      setLoading(false);
    }
    loadData();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
  }

  if (loading) {
    return <div className="dash-loading">Caricamento...</div>;
  }

  return (
    <div className="dash-page">
      <nav className="lnav solid">
        <Link href="/" className="ln-logo">Let&apos;s<span>Night</span></Link>
        <div className="ln-menu">
          <Link href="/explore">Esplora</Link>
          <span className="dash-welcome">Ciao, {profile?.full_name || 'utente'}</span>
          <button onClick={handleLogout} className="ln-btn-ghost">Esci</button>
        </div>
      </nav>

      <div className="dash-hero">
        <div className="dash-hero-content">
          <div className="dash-label">La tua area</div>
          <h1 className="dash-title">Ciao <em>{profile?.full_name?.split(' ')[0] || 'utente'}</em></h1>
          <p className="dash-sub">Gestisci le tue prenotazioni, aggiorna il profilo e scopri nuovi eventi.</p>
        </div>
      </div>

      <div className="dash-grid">
        <div className="dash-main">
          <div className="dash-section">
            <h2 className="dash-section-title">Le tue prenotazioni</h2>
            {bookings.length === 0 ? (
              <div className="dash-empty">
                <p>Non hai ancora prenotazioni.</p>
                <Link href="/explore" className="ln-btn-primary">Scopri gli eventi</Link>
              </div>
            ) : (
              <div className="dash-bookings">
                {bookings.map(b => (
                  <div key={b.id} className="dash-booking">
                    <div className="dash-booking-info">
                      <h3>{b.events?.title}</h3>
                      <p>{b.events?.venues?.name} - {b.events?.venues?.city}</p>
                      <span className="dash-booking-date">{b.events?.event_date} alle {b.events?.event_time?.substring(0,5)}</span>
                    </div>
                    <div className="dash-booking-status">
                      <span className={'dash-status dash-status-' + b.status}>{b.status}</span>
                      <strong>EUR {b.total_price}</strong>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="dash-aside">
          <div className="dash-card">
            <h3 className="dash-card-title">Il tuo profilo</h3>
            <div className="dash-info">
              <div><span>Nome</span><strong>{profile?.full_name || '-'}</strong></div>
              <div><span>Email</span><strong>{user?.email}</strong></div>
              <div><span>Telefono</span><strong>{profile?.phone || '-'}</strong></div>
              <div><span>Citta</span><strong>{profile?.city || '-'}</strong></div>
            </div>
          </div>

          <div className="dash-card">
            <h3 className="dash-card-title">Statistiche</h3>
            <div className="dash-stats">
              <div className="dash-stat">
                <strong>{bookings.length}</strong>
                <span>prenotazioni</span>
              </div>
              <div className="dash-stat">
                <strong>{bookings.filter(b => b.status === 'confirmed').length}</strong>
                <span>confermate</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
