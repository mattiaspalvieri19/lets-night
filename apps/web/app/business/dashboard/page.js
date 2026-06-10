'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import {
  CATS_NO_TUTTI, formatDateFull, formatTime, getPriceLabel, todayLocal,
  MUSIC_TYPES, DRESS_CODES, AGE_TARGETS, QUICK_TAGS,
} from '@lets-night/shared';

export default function BusinessDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [venue, setVenue] = useState(null);
  const [events, setEvents] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [eventsFilter, setEventsFilter] = useState('all');
  const [eventsSearch, setEventsSearch] = useState('');
  const [newEvent, setNewEvent] = useState({
    title: '',
    description: '',
    category: 'Discoteca',
    event_date: '',
    event_time: '',
    end_time: '',
    price: '',
    capacity: '',
    area: '',
    music_type: '',
    dress_code: '',
    age_target: '',
    tags: [],
    has_tables: false,
    table_price: '',
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

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (profile?.role !== 'business') {
        router.push('/dashboard');
        return;
      }

      const { data: venueData } = await supabase.from('venues').select('*').eq('owner_id', session.user.id).maybeSingle();
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

  // Nega l'ingresso + rimborso (se a pagamento). Il rimborso lo avvia SOLO il locale:
  // l'utente non ha self-service refund. No-show = nessun rimborso.
  async function handleDenyRefund(bookingId) {
    if (!confirm('Negare l\'ingresso e rimborsare (se a pagamento) questa prenotazione?\n\nUsa solo se NON fai entrare la persona — non per chi semplicemente non si presenta.')) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch('/api/stripe/refund-booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId, accessToken: session.access_token, reason: 'denied_entry' }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { alert(json.error || 'Operazione non riuscita.'); return; }
    loadData();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/business');
  }

  async function handleCreateEvent(e) {
    e.preventDefault();
    if (!venue || !venue.is_verified) return;
    if (newEvent.event_date && newEvent.event_date < todayLocal()) {
      alert('Non puoi creare un evento per una data passata.');
      return;
    }
    setCreatingEvent(true);

    const priceNum = parseFloat(String(newEvent.price).replace(',', '.'));
    const capacityNum = newEvent.capacity ? parseInt(String(newEvent.capacity).replace(/\D/g, ''), 10) : null;

    const { error } = await supabase.from('events').insert({
      venue_id: venue.id,
      title: newEvent.title,
      description: newEvent.description,
      category: newEvent.category,
      event_date: newEvent.event_date,
      event_time: newEvent.event_time,
      end_time: newEvent.end_time || null,
      area: newEvent.area || null,
      music_type: newEvent.music_type || null,
      dress_code: newEvent.dress_code || null,
      age_target: newEvent.age_target || null,
      tags: (() => {
        const t = newEvent.tags || [];
        if (newEvent.has_tables && !t.map(x => x.toLowerCase()).includes('tavoli')) {
          return [...t, 'Tavoli'];
        }
        return t;
      })(),
      has_tables: !!newEvent.has_tables,
      table_price: newEvent.table_price ? parseFloat(String(newEvent.table_price).replace(',', '.')) : null,
      price: isNaN(priceNum) ? 0 : priceNum,
      capacity: capacityNum || null,
      is_active: true,
    });

    if (error) {
      alert('Errore: ' + error.message);
      setCreatingEvent(false);
      return;
    }

    setShowNewEvent(false);
    setNewEvent({
      title: '', description: '', category: 'Discoteca',
      event_date: '', event_time: '', end_time: '',
      price: '', capacity: '', area: '',
      music_type: '', dress_code: '', age_target: '', tags: [],
      has_tables: false, table_price: '',
    });
    setCreatingEvent(false);
    loadData();
  }

  function toggleNewTag(t) {
    setNewEvent(s => ({
      ...s,
      tags: s.tags.includes(t) ? s.tags.filter(x => x !== t) : [...s.tags, t],
    }));
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
          <div style={{ marginTop: 14 }}>
            <Link href="/business/venue/edit" className="ln-btn-ghost" style={{ display: 'inline-block' }}>
              ✏️ Modifica locale
            </Link>
          </div>
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
                    <input type="date" min={todayLocal()} value={newEvent.event_date} onChange={e => setNewEvent({...newEvent, event_date: e.target.value})} required />
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
                    <input type="number" placeholder="Lascia vuoto per illimitata" min="1" value={newEvent.capacity} onChange={e => setNewEvent({...newEvent, capacity: e.target.value})} />
                  </div>
                </div>

                <div className="auth-row">
                  <div className="auth-field">
                    <label>Orario fine (opzionale)</label>
                    <input type="time" value={newEvent.end_time} onChange={e => setNewEvent({...newEvent, end_time: e.target.value})} />
                  </div>
                  <div className="auth-field">
                    <label>Zona / Quartiere</label>
                    <input type="text" placeholder="Es. Navigli" value={newEvent.area} onChange={e => setNewEvent({...newEvent, area: e.target.value})} />
                  </div>
                </div>

                <div className="auth-row">
                  <div className="auth-field">
                    <label>Tipo musica</label>
                    <select value={newEvent.music_type} onChange={e => setNewEvent({...newEvent, music_type: e.target.value})}>
                      <option value="">Non specificato</option>
                      {MUSIC_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div className="auth-field">
                    <label>Dress code</label>
                    <select value={newEvent.dress_code} onChange={e => setNewEvent({...newEvent, dress_code: e.target.value})}>
                      <option value="">Non specificato</option>
                      {DRESS_CODES.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="auth-field">
                    <label>Età target</label>
                    <select value={newEvent.age_target} onChange={e => setNewEvent({...newEvent, age_target: e.target.value})}>
                      <option value="">Non specificato</option>
                      {AGE_TARGETS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                </div>

                <div className="auth-field">
                  <label>Tag evento</label>
                  <div className="adv-filter-row" style={{ marginTop: 6 }}>
                    {QUICK_TAGS.map(t => (
                      <button key={t} type="button"
                        className={'adv-filter-chip ' + (newEvent.tags.includes(t) ? 'active' : '')}
                        onClick={() => toggleNewTag(t)}>{t}</button>
                    ))}
                  </div>
                  <p style={{ color: 'var(--text2)', fontSize: 11, marginTop: 8 }}>
                    Aiutano gli utenti a trovare il tuo evento (Live Music / Gratis / Tavoli / ecc.)
                  </p>
                </div>

                <div className="auth-row" style={{ alignItems: 'flex-end' }}>
                  <div className="auth-field">
                    <label style={{ cursor: 'pointer' }}>
                      <input type="checkbox" checked={newEvent.has_tables}
                        onChange={e => setNewEvent({ ...newEvent, has_tables: e.target.checked })}
                        style={{ marginRight: 8 }} />
                      Tavoli disponibili
                    </label>
                  </div>
                  {newEvent.has_tables && (
                    <div className="auth-field">
                      <label>Prezzo tavolo (EUR)</label>
                      <input type="number" step="0.01" placeholder="Lascia vuoto = su richiesta"
                        value={newEvent.table_price}
                        onChange={e => setNewEvent({ ...newEvent, table_price: e.target.value })} />
                    </div>
                  )}
                </div>

                <button type="submit" className="biz-submit" disabled={creatingEvent}>
                  {creatingEvent ? 'Pubblicazione...' : 'Pubblica evento'}
                </button>
              </form>
            )}

            {(() => {
              const today = todayLocal();
              const counts = {
                all: events.length,
                upcoming: events.filter(e => e.event_date >= today && e.is_active).length,
                draft: events.filter(e => !e.is_active && e.event_date >= today).length,
                past: events.filter(e => e.event_date < today).length,
                soldout: events.filter(e => e.capacity && (e.booked_count || 0) >= e.capacity).length,
              };
              const filtered = events.filter(e => {
                if (eventsFilter === 'upcoming') { if (!(e.event_date >= today && e.is_active)) return false; }
                else if (eventsFilter === 'draft') { if (e.is_active || e.event_date < today) return false; }
                else if (eventsFilter === 'past') { if (!(e.event_date < today)) return false; }
                else if (eventsFilter === 'soldout') { if (!(e.capacity && (e.booked_count || 0) >= e.capacity)) return false; }
                if (eventsSearch) {
                  const q = eventsSearch.toLowerCase();
                  const hay = `${e.title || ''} ${e.category || ''}`.toLowerCase();
                  if (!hay.includes(q)) return false;
                }
                return true;
              });
              return (
                <>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                    <input
                      type="text" placeholder="Cerca per titolo o categoria..."
                      value={eventsSearch} onChange={e => setEventsSearch(e.target.value)}
                      style={{
                        flex: '1 1 200px',
                        background: 'var(--dark3)', border: '1px solid var(--border-subtle)',
                        borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none',
                      }} />
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {[
                        ['all', 'Tutti'],
                        ['upcoming', 'Pubblicati'],
                        ['draft', 'Bozze'],
                        ['past', 'Passati'],
                        ['soldout', 'Sold out'],
                      ].map(([id, label]) => {
                        const active = eventsFilter === id;
                        return (
                          <button key={id} onClick={() => setEventsFilter(id)}
                            style={{
                              padding: '6px 12px', borderRadius: 12,
                              background: active ? 'rgba(168,85,247,0.15)' : 'transparent',
                              border: '1px solid ' + (active ? 'var(--purple-light)' : 'var(--border-subtle)'),
                              color: active ? '#fff' : 'var(--text-secondary)',
                              fontSize: 11, fontWeight: active ? 600 : 500,
                              cursor: 'pointer', fontFamily: 'inherit',
                            }}>
                            {label} <span style={{ color: 'var(--text-disabled)' }}>({counts[id]})</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {filtered.length === 0 ? (
                    <div className="empty">
                      <div className="empty-title">
                        {events.length === 0 ? 'Non hai ancora creato eventi' : 'Nessun evento per questo filtro'}
                      </div>
                      <div className="empty-sub">
                        {events.length === 0
                          ? 'Crea il tuo primo evento per iniziare ad accettare prenotazioni.'
                          : 'Cambia filtro o resetta la ricerca.'}
                      </div>
                      {events.length === 0 && venue?.is_verified && (
                        <button className="ln-btn-primary" onClick={() => setShowNewEvent(true)}>
                          Crea evento
                        </button>
                      )}
                    </div>
                  ) : (
              <div className="biz-events-list">
                {filtered.map(ev => {
                  const isPast = ev.event_date < today;
                  const soldOut = ev.capacity && (ev.booked_count || 0) >= ev.capacity;
                  const statusLabel = !ev.is_active ? 'Bozza'
                    : isPast ? 'Passato'
                    : soldOut ? 'Sold out'
                    : 'Pubblicato';
                  const statusColor = !ev.is_active ? '#94A3B8'
                    : isPast ? '#64748B'
                    : soldOut ? '#F87171'
                    : '#4ADE80';
                  return (
                  <Link
                    key={ev.id}
                    href={`/business/event/${ev.id}`}
                    className={'biz-event-item ' + (ev.is_active ? '' : 'inactive')}
                    style={{ textDecoration: 'none', cursor: 'pointer' }}>
                    <div className="biz-event-info">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <h3 style={{ margin: 0 }}>{ev.title}</h3>
                        <span style={{
                          padding: '2px 7px', borderRadius: 4,
                          border: '1px solid ' + statusColor + '40',
                          background: statusColor + '15',
                          color: statusColor, fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
                        }}>{statusLabel}</span>
                      </div>
                      <div className="biz-event-meta">
                        <span>{ev.event_date} · {ev.event_time?.substring(0,5)}</span>
                        <span>{getPriceLabel(ev.price)}</span>
                        <span>{ev.booked_count || 0}{ev.capacity ? `/${ev.capacity}` : ''} posti</span>
                      </div>
                      <div style={{ color: 'var(--purple-light)', fontSize: 11, marginTop: 6 }}>
                        Statistiche e lista ospiti →
                      </div>
                    </div>
                    <button
                      className={'biz-toggle ' + (ev.is_active ? 'active' : '')}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleEventActive(ev.id, ev.is_active); }}
                    >
                      {ev.is_active ? 'Attivo' : 'Nascosto'}
                    </button>
                  </Link>
                  );
                })}
              </div>
                  )}
                </>
              );
            })()}
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
                      {b.status === 'denied' ? (
                        <span style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: '#f87171' }}>
                          Ingresso negato{b.refunded_at ? ' · rimborsato' : ''}
                        </span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6, alignItems: 'flex-end' }}>
                          <button
                            onClick={() => handleCheckIn(b.id, b.checked_in)}
                            disabled={b.checked_in}
                            className={'biz-toggle ' + (b.checked_in ? 'active' : '')}
                          >
                            {b.checked_in ? '✓ Entrato' : 'Check-in'}
                          </button>
                          {!b.checked_in && (
                            <button
                              onClick={() => handleDenyRefund(b.id)}
                              style={{ padding: '4px 10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                            >
                              Nega / Rimborsa
                            </button>
                          )}
                        </div>
                      )}
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
