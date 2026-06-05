'use client';

import { useEffect, useState, useMemo, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../../lib/supabase';
import { formatDateFull, formatTime } from '@lets-night/shared';

const FILTERS = [
  { id: 'all',     label: 'Tutti' },
  { id: 'ticket',  label: 'Biglietti' },
  { id: 'table',   label: 'Tavoli' },
  { id: 'checked', label: '✓ Entrati' },
];

const GENDER_LABEL = { M: 'M', F: 'F', X: 'X' };

function calcAge(birthDate) {
  if (!birthDate) return null;
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age < 0 ? null : age;
}

export default function BusinessEventDetailPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const [event, setEvent] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [checkingIn, setCheckingIn] = useState(null);
  const [forbidden, setForbidden] = useState(false);

  async function loadData() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push('/business/login'); return; }

    const { data: ev } = await supabase
      .from('events')
      .select('*, venues!inner(id, name, zona, city, owner_id)')
      .eq('id', id)
      .maybeSingle();

    if (!ev || ev.venues.owner_id !== session.user.id) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    setEvent(ev);

    const { data: bks } = await supabase
      .from('bookings')
      .select('*, profiles(full_name, phone, birth_date, gender)')
      .eq('event_id', id)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false });
    setBookings(bks || []);
  }

  useEffect(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [id]);

  async function toggleCheckIn(bookingId, alreadyIn) {
    setCheckingIn(bookingId);
    const { error } = await supabase.from('bookings').update({
      checked_in: !alreadyIn,
      checked_in_at: !alreadyIn ? new Date().toISOString() : null,
    }).eq('id', bookingId);
    setCheckingIn(null);
    if (error) { alert('Errore: ' + error.message); return; }
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, checked_in: !alreadyIn } : b));
  }

  const filtered = useMemo(() => {
    if (filter === 'all') return bookings;
    if (filter === 'ticket') return bookings.filter(b => (b.booking_type || 'ticket') === 'ticket');
    if (filter === 'table') return bookings.filter(b => b.booking_type === 'table');
    if (filter === 'checked') return bookings.filter(b => b.checked_in);
    return bookings;
  }, [bookings, filter]);

  const stats = useMemo(() => {
    const tickets = bookings.filter(b => (b.booking_type || 'ticket') === 'ticket');
    const tables = bookings.filter(b => b.booking_type === 'table');
    const checkedIn = bookings.filter(b => b.checked_in).length;
    const totalGuests = bookings.reduce((s, b) => s + (b.quantity || 1), 0);
    const revenue = bookings
      .filter(b => b.status === 'confirmed')
      .reduce((s, b) => s + parseFloat(b.total_price || 0), 0);
    return { tickets: tickets.length, tables: tables.length, checkedIn, totalGuests, revenue };
  }, [bookings]);

  if (loading) return <div className="dash-loading">Caricamento...</div>;
  if (forbidden) return (
    <div className="dash-loading">
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ color: '#fff' }}>Accesso negato</h2>
        <p style={{ color: 'var(--text2)' }}>Questo evento non appartiene al tuo locale.</p>
        <Link href="/business/dashboard" className="ln-btn-primary">Torna alla dashboard</Link>
      </div>
    </div>
  );

  return (
    <div className="dash-page">
      <nav className="lnav solid biz-dash-nav">
        <Link href="/" className="ln-logo">Let&apos;s<span>Night</span> <span className="biz-tag-nav">Business</span></Link>
        <div className="ln-menu">
          <Link href="/business/dashboard">← Dashboard</Link>
        </div>
      </nav>

      <div className="biz-dash-grid" style={{ display: 'block', maxWidth: 1000, margin: '0 auto', padding: '2rem' }}>
        {/* Header evento */}
        <div className="dash-section" style={{ marginBottom: 16 }}>
          <div style={{ color: 'var(--purple-light)', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>
            {event.category}
          </div>
          <h1 style={{ color: '#fff', fontSize: 26, fontWeight: 900, margin: 0 }}>{event.title}</h1>
          <p style={{ color: '#9ca3af', fontSize: 14, marginTop: 6 }}>
            {formatDateFull(event.event_date)} · {formatTime(event.event_time)}
          </p>
          <p style={{ color: 'var(--text2)', fontSize: 12, marginTop: 4 }}>
            📍 {event.venues?.name} · {event.venues?.zona}, {event.venues?.city}
          </p>
        </div>

        {/* Stats grid uniforme */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 24 }}>
          <StatCard label="Biglietti" value={stats.tickets} />
          <StatCard label="Tavoli" value={stats.tables} />
          <StatCard label="Check-in" value={`${stats.checkedIn}/${bookings.length}`} />
          <StatCard label="Entrate" value={`€${stats.revenue.toFixed(0)}`} />
          <StatCard label="Ospiti" value={stats.totalGuests} />
          {event.capacity && (
            <StatCard label="Capienza" value={`${event.booked_count || 0}/${event.capacity}`} />
          )}
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={'adv-filter-chip ' + (filter === f.id ? 'active' : '')}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Lista ospiti */}
        <div className="dash-section">
          <h2 className="dash-section-title">Lista ospiti ({filtered.length})</h2>

          {filtered.length === 0 ? (
            <div className="empty">
              <div className="empty-title">Nessun ospite</div>
              <div className="empty-sub">
                {bookings.length === 0
                  ? 'Nessuna prenotazione per questo evento.'
                  : 'Cambia filtro per vedere altri ospiti.'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map(b => {
                const age = calcAge(b.profiles?.birth_date);
                const isTable = b.booking_type === 'table';
                return (
                  <div key={b.id} className="guest-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>
                          {b.profiles?.full_name || 'Utente'}
                        </span>
                        <span className={'guest-tag ' + (isTable ? 'table' : 'ticket')}>
                          {isTable ? 'TAV' : 'ING'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 4, fontSize: 11, color: '#94a3b8' }}>
                        {b.profiles?.gender && <span>{GENDER_LABEL[b.profiles.gender]}</span>}
                        {age != null && <span>· {age} anni</span>}
                        <span>· {isTable ? `Tavolo ${b.quantity}` : `${b.quantity} ${b.quantity > 1 ? 'ingressi' : 'ingresso'}`}</span>
                      </div>
                      {b.profiles?.phone && (
                        <div style={{ color: '#475569', fontSize: 11, marginTop: 3 }}>{b.profiles.phone}</div>
                      )}
                    </div>
                    <button
                      onClick={() => toggleCheckIn(b.id, b.checked_in)}
                      disabled={checkingIn === b.id}
                      className={'guest-checkin ' + (b.checked_in ? 'done' : '')}>
                      {checkingIn === b.id ? '...' : (b.checked_in ? 'Entrato' : 'Check-in')}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={{
      background: 'var(--dark2)', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 10, padding: 16,
    }}>
      <div style={{ color: '#fff', fontSize: 22, fontWeight: 700, letterSpacing: '-0.3px' }}>{value}</div>
      <div style={{ color: 'var(--text2)', fontSize: 11, marginTop: 4 }}>{label}</div>
    </div>
  );
}
