'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { CATS_NO_TUTTI, formatDateFull, formatTime } from '@lets-night/shared';

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export default function BusinessDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [venue, setVenue] = useState(null);
  const [events, setEvents] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [newEvent, setNewEvent] = useState({
    title: '',
    description: '',
    category: 'Discoteca',
    event_date: '',
    event_time: '',
    price: '',
    capacity: '',
  });
  const [creatingEvent, setCreatingEvent] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/business/login');
        return;
      }
      setUser(session.user);

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
      if (profile?.role !== 'business') {
        router.push('/dashboard');
        return;
      }

      const { data: venueData } = await supabase.from('venues').select('*').eq('owner_id', session.user.id).single();
      setVenue(venueData);

      if (venueData) {
        const { data: eventsData } = await supabase.from('events').select('*').eq('venue_id', venueData.id).order('event_date', { ascending: false });
        setEvents(eventsData || []);

        const eventIds = (eventsData || []).map(e => e.id);
        if (eventIds.length > 0) {
          const { data: bookingsData } = await supabase
            .from('bookings')
            .select('*, events(title, event_date, event_time), profiles(full_name, phone)')
            .in('event_id', eventIds)
            .neq('status', 'cancelled')
            .order('created_at', { ascending: false });
          setBookings(bookingsData || []);
        }
      }
    } catch (e) {
      console.error('Errore dashboard:', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckIn(bookingId, alreadyIn) {
    if (alreadyIn) return;
    const { error } = await supabase.from('bookings').update({
      checked_in: true,
      checked_in_at: new Date().toISOString(),
    }).eq('id', bookingId);
    if (error) { alert('Errore: ' + error.message); return; }
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, checked_in: true } : b));
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/business');
  }

  async function handleCreateEvent(e) {
    e.preventDefault();
    if (!venue || !venue.is_verified) return;
    setCreatingEvent(true);

    const { error } = await supabase.from('events').insert({
      venue_id: venue.id,
      title: newEvent.title,
      description: newEvent.description,
      category: newEvent.category,
      event_date: newEvent.event_date,
      event_time: newEvent.event_time,
      price: parseFloat(newEvent.price) || 0,
      capacity: parseInt(newEvent.capacity) || 100,
      is_active: true,
    });

    if (error) {
      alert('Errore: ' + error.message);
      setCreatingEvent(false);
      return;
    }

    setShowNewEvent(false);
    setNewEvent({ title: '', description: '', category: 'Discoteca', event_date: '', event_time: '', price: '', capacity: '' });
    setCreatingEvent(false);
    loadData();
  }

  async function toggleEventActive(eventId, currentStatus) {
    await supabase.from('events').update({ is_active: !currentStatus }).eq('id', eventId);
    loadData();
  }

  if (loading) return <div className="dash-loading">Caricamento dashboard...</div>;
  if (!venue) return <div className="dash-loading">Nessun locale trovato per questo account.</div>;

  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const todayStr = todayLocal();
  const weekBookings = bookings.filter(b => b.created_at >= weekAgo);
  const totalRevenue = weekBookings.filter(b => b.status === 'confirmed').reduce((sum, b) => sum + parseFloat(b.total_price || 0), 0);
  const todayCheckins = bookings.filter(b => b.checked_in && b.events?.event_date === todayStr).length;
  const activeEvents = events.filter(e => e.is_active).length;

  return (
    <div className="dash-page biz-dash-page">
      <nav className="lnav solid biz-dash-nav">
        <Link href="/business" className="ln-logo">Let&apos;s<span>Night</span> <span className="biz-tag-nav">Business</span></Link>
        <div className="ln-menu">
          <span className="dash-welcome">{venue.name}</span>
          <button onClick={handleLogout} className="ln-btn-ghost">Esci</button>
        </div>
      </nav>

      {!venue.is_verified && (
        <div className="biz-pending-banner">
          <strong>In attesa di approvazione</strong>
          <span>Il tuo locale e in fase di verifica. Riceverai un email appena approvato. Non puoi ancora pubblicare eventi.</span>
        </div>
      )}

      <div className="dash-hero biz-dash-hero">
        <div className="dash-hero-content">
          <div className="dash-label biz-label">Dashboard locale</div>
          <h1 className="dash-title"><em>{venue.name}</em></h1>
          <p className="dash-sub">{venue.category} - {venue.zona}, {venue.city}</p>
        </div>
      </div>

      <div className="biz-stats-grid">
        <div className="biz-stat-card">
          <span className="biz-stat-label">Check-in oggi</span>
          <strong className="biz-stat-value">{todayCheckins}</strong>
          <span className="biz-stat-sub">ingressi registrati</span>
        </div>
        <div className="biz-stat-card">
          <span className="biz-stat-label">Prenotazioni (7gg)</span>
          <strong className="biz-stat-value">{weekBookings.length}</strong>
          <span className="biz-stat-sub">ultima settimana</span>
        </div>
        <div className="biz-stat-card">
          <span className="biz-stat-label">Entrate (7gg)</span>
          <strong className="biz-stat-value">EUR {totalRevenue.toFixed(2)}</strong>
          <span className="biz-stat-sub">ultima settimana</span>
        </div>
        <div className="biz-stat-card">
          <span className="biz-stat-label">Eventi attivi</span>
          <strong className="biz-stat-value">{activeEvents}</strong>
          <span className="biz-stat-sub">di {events.length} totali</span>
        </div>
        <div className="biz-stat-card">
          <span className="biz-stat-label">Stato locale</span>
          <strong className={'biz-stat-value ' + (venue.is_verified ? 'biz-verified' : 'biz-pending')}>
            {venue.is_verified ? 'Verificato' : 'In attesa'}
          </strong>
          <span className="biz-stat-sub">{venue.is_verified ? 'pubblicabile' : 'non pubblico'}</span>
        </div>
      </div>

      <div className="biz-dash-grid">
        <div className="biz-dash-main">
          <div className="dash-section">
            <div className="biz-section-header">
              <h2 className="dash-section-title">I tuoi eventi</h2>
              {venue.is_verified && (
                <button className="biz-btn-primary" onClick={() => setShowNewEvent(!showNewEvent)}>
                  {showNewEvent ? 'Chiudi' : '+ Nuovo evento'}
                </button>
              )}
            </div>

            {showNewEvent && (
              <form onSubmit={handleCreateEvent} className="biz-new-event-form">
                <h3>Crea nuovo evento</h3>
                <div className="auth-field">
                  <label>Titolo evento</label>
                  <input type="text" value={newEvent.title} onChange={e => setNewEvent({...newEvent, title: e.target.value})} required />
                </div>
                <div className="auth-field">
                  <label>Descrizione</label>
                  <textarea value={newEvent.description} onChange={e => setNewEvent({...newEvent, description: e.target.value})} rows={2} />
                </div>
                <div className="auth-row">
                  <div className="auth-field">
                    <label>Categoria</label>
                    <select value={newEvent.category} onChange={e => setNewEvent({...newEvent, category: e.target.value})}>
                      {CATS_NO_TUTTI.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="auth-field">
                    <label>Data</label>
                    <input type="date" value={newEvent.event_date} onChange={e => setNewEvent({...newEvent, event_date: e.target.value})} required />
                  </div>
                </div>
                <div className="auth-row">
                  <div className="auth-field">
                    <label>Orario</label>
                    <input type="time" value={newEvent.event_time} onChange={e => setNewEvent({...newEvent, event_time: e.target.value})} required />
                  </div>
                  <div className="auth-field">
                    <label>Prezzo EUR</label>
                    <input type="number" step="0.01" value={newEvent.price} onChange={e => setNewEvent({...newEvent, price: e.target.value})} required />
                  </div>
                  <div className="auth-field">
                    <label>Capienza</label>
                    <input type="number" value={newEvent.capacity} onChange={e => setNewEvent({...newEvent, capacity: e.target.value})} required />
                  </div>
                </div>
                <button type="submit" className="biz-submit" disabled={creatingEvent}>
                  {creatingEvent ? 'Pubblicazione...' : 'Pubblica evento'}
                </button>
              </form>
            )}

            {events.length === 0 ? (
              <div className="dash-empty"><p>Non hai ancora pubblicato eventi.</p></div>
            ) : (
              <div className="biz-events-list">
                {events.map(ev => (
                  <div key={ev.id} className={'biz-event-item ' + (ev.is_active ? '' : 'inactive')}>
                    <div className="biz-event-info">
                      <h3>{ev.title}</h3>
                      <div className="biz-event-meta">
                        <span>{ev.event_date} - {ev.event_time?.substring(0,5)}</span>
                        <span>EUR {ev.price}</span>
                        <span>{ev.booked_count || 0}/{ev.capacity} posti</span>
                      </div>
                    </div>
                    <button 
                      className={'biz-toggle ' + (ev.is_active ? 'active' : '')} 
                      onClick={() => toggleEventActive(ev.id, ev.is_active)}
                    >
                      {ev.is_active ? 'Attivo' : 'Nascosto'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="dash-section">
            <h2 className="dash-section-title">Prenotazioni recenti</h2>
            {bookings.length === 0 ? (
              <div className="dash-empty"><p>Nessuna prenotazione ancora.</p></div>
            ) : (
              <div className="biz-bookings-list">
                {bookings.slice(0,20).map(b => (
                  <div key={b.id} className="biz-booking-item">
                    <div>
                      <h4>{b.events?.title}</h4>
                      <span>{b.profiles?.full_name || 'Utente'} - {b.profiles?.phone || 'no tel'}</span>
                    </div>
                    <div className="biz-booking-right">
                      <strong>EUR {b.total_price}</strong>
                      <button
                        onClick={() => handleCheckIn(b.id, b.checked_in)}
                        disabled={b.checked_in}
                        className={'biz-toggle ' + (b.checked_in ? 'active' : '')}
                        style={{ marginTop: 6 }}
                      >
                        {b.checked_in ? '✓ Entrato' : 'Check-in'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="dash-aside">
          <div className="dash-card">
            <h3 className="dash-card-title">Dati locale</h3>
            <div className="dash-info">
              <div><span>Nome</span><strong>{venue.name}</strong></div>
              <div><span>Categoria</span><strong>{venue.category}</strong></div>
              <div><span>Citta</span><strong>{venue.city}</strong></div>
              <div><span>Zona</span><strong>{venue.zona}</strong></div>
              <div><span>Telefono</span><strong>{venue.phone || '-'}</strong></div>
              <div><span>Email</span><strong style={{fontSize:'11px'}}>{user?.email}</strong></div>
            </div>
          </div>

          <div className="dash-card biz-tips-card">
            <h3 className="dash-card-title">Suggerimenti</h3>
            <ul className="biz-tips">
              <li>Pubblica eventi almeno 7 giorni prima per massima visibilita</li>
              <li>Aggiungi descrizioni dettagliate per aumentare conversioni</li>
              <li>Attiva lo status sponsorizzato per eventi importanti</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
