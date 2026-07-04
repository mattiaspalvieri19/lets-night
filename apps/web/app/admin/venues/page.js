'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

export default function AdminVenuesPage() {
  const [loading, setLoading] = useState(true);
  const [venues, setVenues] = useState([]);
  const [eventCounts, setEventCounts] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const { data, error } = await supabase.from('venues').select('*').order('created_at', { ascending: false });
    if (error) console.error('Errore venues admin:', error);
    setVenues(data || []);
    setLoading(false);

    const { data: evs } = await supabase.from('events').select('venue_id');
    if (evs) {
      const counts = {};
      for (const e of evs) counts[e.venue_id] = (counts[e.venue_id] || 0) + 1;
      setEventCounts(counts);
    }
  }

  async function approveVenue(venueId) {
    const { error } = await supabase.from('venues').update({ is_verified: true }).eq('id', venueId);
    if (error) alert('Errore: ' + error.message);
    else loadData();
  }

  async function rejectVenue(venueId) {
    if (!confirm('Sicuro di voler eliminare questo locale? L\'azione è irreversibile.')) return;
    const { error } = await supabase.from('venues').delete().eq('id', venueId);
    if (error) alert('Errore: ' + error.message);
    else loadData();
  }

  async function unverifyVenue(venueId) {
    await supabase.from('venues').update({ is_verified: false }).eq('id', venueId);
    loadData();
  }

  if (loading) return <div className="dash-loading">Caricamento locali...</div>;

  const pending = venues.filter(v => !v.is_verified);
  const approved = venues.filter(v => v.is_verified);

  function VenueRow({ v, actions }) {
    return (
      <div className="biz-event-item">
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flex: 1 }}>
          {v.cover_image && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={v.cover_image} alt={v.name} style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover' }} />
          )}
          <div className="biz-event-info">
            <h3>{v.name}</h3>
            <div className="biz-event-meta">
              <span>{v.category}</span>
              <span>{v.zona}, {v.city}</span>
              <span>{v.contact_email || '-'}</span>
              <span>{v.phone || '-'}</span>
              <span>{eventCounts[v.id] || 0} eventi</span>
            </div>
            {v.description && <p style={{ color: 'var(--text2)', fontSize: '13px', marginTop: '.5rem' }}>{v.description}</p>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '.5rem' }}>{actions}</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem' }}>
      <div className="dash-section" style={{ marginBottom: '2rem' }}>
        <h2 className="dash-section-title">In attesa di approvazione ({pending.length})</h2>
        {pending.length === 0 ? (
          <div className="dash-empty"><p>Nessun locale in attesa.</p></div>
        ) : (
          <div className="biz-events-list">
            {pending.map(v => (
              <VenueRow key={v.id} v={v} actions={
                <>
                  <button onClick={() => approveVenue(v.id)} className="biz-toggle active">Approva</button>
                  <button onClick={() => rejectVenue(v.id)} className="admin-danger-btn">Rifiuta</button>
                </>
              } />
            ))}
          </div>
        )}
      </div>

      <div className="dash-section">
        <h2 className="dash-section-title">Locali approvati ({approved.length})</h2>
        {approved.length === 0 ? (
          <div className="dash-empty"><p>Nessun locale approvato ancora.</p></div>
        ) : (
          <div className="biz-events-list">
            {approved.map(v => (
              <VenueRow key={v.id} v={v} actions={
                <button onClick={() => unverifyVenue(v.id)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>Sospendi</button>
              } />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
