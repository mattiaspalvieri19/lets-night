'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';

function todayLocal() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export default function AdminEventsPage() {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [venues, setVenues] = useState([]);
  const [fVenue, setFVenue] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fSearch, setFSearch] = useState('');

  async function loadData() {
    const [{ data: evs, error }, { data: vs }] = await Promise.all([
      supabase.from('events').select('*, venues(name, zona, city)').order('event_date', { ascending: false }),
      supabase.from('venues').select('id, name').order('name'),
    ]);
    if (error) console.error('Errore eventi admin:', error);
    setEvents(evs || []);
    setVenues(vs || []);
    setLoading(false);
  }

  useEffect(() => {
    (async () => { await loadData(); })();
  }, []);

  async function toggleActive(ev) {
    const { error } = await supabase.from('events').update({ is_active: !ev.is_active }).eq('id', ev.id);
    if (error) { alert('Errore: ' + error.message); return; }
    setEvents(prev => prev.map(e => e.id === ev.id ? { ...e, is_active: !ev.is_active } : e));
  }

  const today = todayLocal();
  const filtered = useMemo(() => events.filter(e => {
    if (fVenue && e.venue_id !== fVenue) return false;
    if (fStatus === 'active' && !e.is_active) return false;
    if (fStatus === 'inactive' && e.is_active) return false;
    if (fStatus === 'future' && e.event_date < today) return false;
    if (fStatus === 'past' && e.event_date >= today) return false;
    if (fStatus === 'soldout' && !(e.capacity && e.booked_count >= e.capacity)) return false;
    if (fSearch.trim() && !e.title.toLowerCase().includes(fSearch.trim().toLowerCase())) return false;
    return true;
  }), [events, fVenue, fStatus, fSearch, today]);

  if (loading) return <div className="dash-loading">Caricamento eventi...</div>;

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem' }}>
      <div className="dash-section">
        <h2 className="dash-section-title">Tutti gli eventi ({filtered.length})</h2>
        <div className="admin-filters">
          <select value={fVenue} onChange={e => setFVenue(e.target.value)}>
            <option value="">Tutti i locali</option>
            {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <select value={fStatus} onChange={e => setFStatus(e.target.value)}>
            <option value="">Tutti gli stati</option>
            <option value="active">Attivi</option>
            <option value="inactive">Disattivati</option>
            <option value="future">Futuri</option>
            <option value="past">Passati</option>
            <option value="soldout">Sold out</option>
          </select>
          <input placeholder="Cerca per titolo..." value={fSearch} onChange={e => setFSearch(e.target.value)} />
        </div>

        {filtered.length === 0 ? (
          <div className="dash-empty"><p>Nessun evento trovato.</p></div>
        ) : (
          <div className="biz-events-list">
            {filtered.map(ev => {
              const soldout = ev.capacity && ev.booked_count >= ev.capacity;
              return (
                <div key={ev.id} className="biz-event-item">
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flex: 1 }}>
                    {ev.cover_image && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={ev.cover_image} alt={ev.title} style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover' }} />
                    )}
                    <div className="biz-event-info">
                      <h3>{ev.title}</h3>
                      <div className="biz-event-meta">
                        <span>{ev.venues?.name || '-'}</span>
                        <span>{ev.venues ? `${ev.venues.zona}, ${ev.venues.city}` : '-'}</span>
                        <span>{ev.event_date}</span>
                        <span>{ev.booked_count || 0}/{ev.capacity || '∞'}</span>
                        {!ev.is_active && <span style={{ color: '#f87171' }}>Disattivato</span>}
                        {soldout && <span style={{ color: '#fbbf24' }}>Sold out</span>}
                        {ev.event_date < today && <span>Concluso</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '.5rem' }}>
                    <button onClick={() => toggleActive(ev)} className={'biz-toggle' + (ev.is_active ? ' active' : '')}>
                      {ev.is_active ? 'Attivo' : 'Disattivato'}
                    </button>
                    <Link href={`/admin/events/${ev.id}`} className="ln-btn-ghost" style={{ padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, color: 'var(--text2)' }}>
                      Gestisci
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
