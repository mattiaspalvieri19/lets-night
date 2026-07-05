'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

const PAGE_SIZE = 50;

const STATUS_LABELS = {
  confirmed: 'Confermata',
  cancelled: 'Annullata',
  denied: 'Negata/Rimborsata',
};

export default function AdminBookingsPage() {
  const [loading, setLoading] = useState(true);
  const [refundReqs, setRefundReqs] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [venues, setVenues] = useState([]);
  const [events, setEvents] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(null);

  const [fVenue, setFVenue] = useState('');
  const [fEvent, setFEvent] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fCheckedIn, setFCheckedIn] = useState('');
  const [fName, setFName] = useState('');

  useEffect(() => {
    (async () => {
      const [{ data: vs }, { data: evs }] = await Promise.all([
        supabase.from('venues').select('id, name').order('name'),
        supabase.from('events').select('id, title, venue_id, event_date').order('event_date', { ascending: false }),
      ]);
      setVenues(vs || []);
      setEvents(evs || []);
    })();
  }, []);

  const loadRefundReqs = useCallback(async () => {
    const { data: rr, error } = await supabase
      .from('bookings')
      .select('id, total_price, fee, snapshot_full_name, refund_requested_at, refund_request_reason, events(title, event_date)')
      .not('refund_requested_at', 'is', null)
      .not('status', 'in', '("cancelled","denied")')
      .order('refund_requested_at', { ascending: true });
    if (error) console.error('Errore richieste rimborso:', error);
    setRefundReqs(rr || []);
  }, []);

  const loadBookings = useCallback(async (pageIndex) => {
    // events!inner permette il filtro locale server-side: paginazione corretta.
    let q = supabase
      .from('bookings')
      .select('*, events!inner(id, title, event_date, venue_id, venues(name))')
      .order('created_at', { ascending: false })
      .range(pageIndex * PAGE_SIZE, pageIndex * PAGE_SIZE + PAGE_SIZE);
    if (fVenue) q = q.eq('events.venue_id', fVenue);
    if (fEvent) q = q.eq('event_id', fEvent);
    if (fStatus) q = q.eq('status', fStatus);
    if (fCheckedIn) q = q.eq('checked_in', fCheckedIn === 'yes');
    if (fName.trim()) q = q.ilike('snapshot_full_name', `%${fName.trim()}%`);
    const { data, error } = await q;
    if (error) { console.error('Errore prenotazioni admin:', error); return []; }
    const rows = data || [];
    setHasMore(rows.length > PAGE_SIZE);
    return rows.slice(0, PAGE_SIZE);
  }, [fVenue, fEvent, fStatus, fCheckedIn, fName]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadRefundReqs();
      const rows = await loadBookings(0);
      setBookings(rows);
      setPage(0);
      setLoading(false);
    })();
  }, [loadRefundReqs, loadBookings]);

  async function refresh() {
    await loadRefundReqs();
    const rows = await loadBookings(page);
    setBookings(rows);
  }

  async function loadMore() {
    const next = page + 1;
    const rows = await loadBookings(next);
    setBookings(prev => [...prev, ...rows]);
    setPage(next);
  }

  async function resolveRefund(bookingId, action) {
    if (action === 'approve' && !confirm('Approvare il rimborso no-show? Verrà rimborsato il prezzo del biglietto al netto delle commissioni (Stripe + servizio); il locale incassa € 0.')) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setBusy(bookingId);
    const res = await fetch('/api/refund/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId, accessToken: session.access_token, action }),
    });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) { alert(json.error || 'Operazione non riuscita.'); return; }
    refresh();
  }

  async function toggleCheckIn(b) {
    setBusy(b.id);
    // L'un-check preserva checked_in_at (regola review 3f3a56c, come mobile).
    const patch = b.checked_in
      ? { checked_in: false }
      : { checked_in: true, checked_in_at: new Date().toISOString() };
    const { error } = await supabase.from('bookings').update(patch).eq('id', b.id);
    setBusy(null);
    if (error) { alert('Errore: ' + error.message); return; }
    refresh();
  }

  async function cancelNoRefund(b) {
    const msg = b.table_id
      ? 'Annullare SENZA rimborso questa quota tavolo? Il posto torna in raccolta sul tavolo.'
      : 'Annullare SENZA rimborso questa prenotazione? Il QR verrà invalidato.';
    if (!confirm(msg)) return;
    setBusy(b.id);
    const { error } = await supabase.from('bookings')
      .update({ status: 'cancelled', qr_code: null })
      .eq('id', b.id);
    setBusy(null);
    if (error) { alert('Errore: ' + error.message); return; }
    refresh();
  }

  async function denyAndRefund(b) {
    if (!confirm('Negare l\'ingresso e rimborsare la prenotazione via Stripe?')) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setBusy(b.id);
    const res = await fetch('/api/stripe/refund-booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: b.id, accessToken: session.access_token, reason: 'Annullata dall\'amministrazione' }),
    });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) { alert(json.error || 'Operazione non riuscita.'); return; }
    refresh();
  }

  if (loading) return <div className="dash-loading">Caricamento prenotazioni...</div>;

  const filteredEvents = fVenue ? events.filter(e => e.venue_id === fVenue) : events;

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem' }}>
      <div className="dash-section" style={{ marginBottom: '2rem' }}>
        <h2 className="dash-section-title">Richieste di rimborso ({refundReqs.length})</h2>
        {refundReqs.length === 0 ? (
          <div className="dash-empty"><p>Nessuna richiesta di rimborso in attesa.</p></div>
        ) : (
          <div className="biz-events-list">
            {refundReqs.map(r => {
              const price = Number(r.total_price) || 0;
              return (
                <div key={r.id} className="biz-event-item">
                  <div className="biz-event-info">
                    <h3>{r.snapshot_full_name || 'Utente'}</h3>
                    <div className="biz-event-meta">
                      <span>{r.events?.title || 'Evento'}</span>
                      <span>{r.events?.event_date || '-'}</span>
                      <span>Rimborso ≈ € {price.toFixed(2)} (biglietto al netto delle commissioni) · locale € 0</span>
                    </div>
                    {r.refund_request_reason && (
                      <p style={{ color: 'var(--text2)', fontSize: '13px', marginTop: '.5rem' }}>Motivo: {r.refund_request_reason}</p>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '.5rem' }}>
                    <button onClick={() => resolveRefund(r.id, 'approve')} className="biz-toggle active" disabled={busy === r.id}>Approva rimborso</button>
                    <button onClick={() => resolveRefund(r.id, 'reject')} className="admin-danger-btn" disabled={busy === r.id}>Rifiuta</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="dash-section">
        <h2 className="dash-section-title">Tutte le prenotazioni</h2>
        <div className="admin-filters">
          <select value={fVenue} onChange={e => { setFVenue(e.target.value); setFEvent(''); }}>
            <option value="">Tutti i locali</option>
            {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <select value={fEvent} onChange={e => setFEvent(e.target.value)}>
            <option value="">Tutti gli eventi</option>
            {filteredEvents.map(e => <option key={e.id} value={e.id}>{e.title} ({e.event_date})</option>)}
          </select>
          <select value={fStatus} onChange={e => setFStatus(e.target.value)}>
            <option value="">Tutti gli stati</option>
            <option value="confirmed">Confermate</option>
            <option value="cancelled">Annullate</option>
            <option value="denied">Negate/Rimborsate</option>
          </select>
          <select value={fCheckedIn} onChange={e => setFCheckedIn(e.target.value)}>
            <option value="">Check-in: tutti</option>
            <option value="yes">Entrati</option>
            <option value="no">Non entrati</option>
          </select>
          <input placeholder="Cerca per nome..." value={fName} onChange={e => setFName(e.target.value)} />
        </div>

        {bookings.length === 0 ? (
          <div className="dash-empty"><p>Nessuna prenotazione trovata.</p></div>
        ) : (
          <div className="biz-events-list">
            {bookings.map(b => {
              const isOpen = expanded === b.id;
              const price = Number(b.total_price) || 0;
              const fee = Number(b.fee) || 0;
              const type = b.table_id ? 'Quota tavolo' : (b.booking_type || 'Biglietto');
              return (
                <div key={b.id} className="biz-event-item" style={{ flexDirection: 'column', alignItems: 'stretch', cursor: 'pointer' }} onClick={() => setExpanded(isOpen ? null : b.id)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                    <div className="biz-event-info">
                      <h3>{b.snapshot_full_name || 'Utente'}</h3>
                      <div className="biz-event-meta">
                        <span>{b.events?.title || 'Evento'}</span>
                        <span>{b.events?.venues?.name || '-'}</span>
                        <span>{b.events?.event_date || '-'}</span>
                        <span>€ {price.toFixed(2)}</span>
                        <span>{STATUS_LABELS[b.status] || b.status}</span>
                        {b.checked_in && <span style={{ color: '#4ade80' }}>Entrato</span>}
                      </div>
                    </div>
                    <span style={{ color: 'var(--text2)', fontSize: 12 }}>{isOpen ? '▲' : '▼'}</span>
                  </div>
                  {isOpen && (
                    <div onClick={e => e.stopPropagation()} style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                      <div className="biz-event-meta" style={{ marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '.8rem' }}>
                        <span>Tipo: {type}</span>
                        <span>Quantità: {b.quantity || 1}</span>
                        <span>Totale: € {price.toFixed(2)} (fee € {fee.toFixed(2)})</span>
                        <span>{b.stripe_session_id ? 'Pagata (Stripe)' : 'Gratuita'}</span>
                        <span>Creata: {b.created_at ? new Date(b.created_at).toLocaleString('it-IT') : '-'}</span>
                        {b.checked_in_at && <span>Check-in: {new Date(b.checked_in_at).toLocaleString('it-IT')}</span>}
                        {b.refund_requested_at && <span>Rimborso richiesto: {new Date(b.refund_requested_at).toLocaleString('it-IT')}</span>}
                      </div>
                      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                        {b.status === 'confirmed' && (
                          <button onClick={() => toggleCheckIn(b)} className="biz-toggle active" disabled={busy === b.id}>
                            {b.checked_in ? 'Annulla check-in' : 'Check-in'}
                          </button>
                        )}
                        {b.status === 'confirmed' && b.stripe_session_id && (
                          <button onClick={() => denyAndRefund(b)} className="admin-danger-btn" disabled={busy === b.id}>Nega + rimborsa</button>
                        )}
                        {b.status === 'confirmed' && (
                          <button onClick={() => cancelNoRefund(b)} className="admin-danger-btn" disabled={busy === b.id}>Annulla senza rimborso</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {hasMore && (
          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <button onClick={loadMore} className="ln-btn-ghost" style={{ background: 'transparent', border: '1px solid var(--border)', padding: '10px 24px', borderRadius: 8, color: 'var(--text2)', cursor: 'pointer', fontSize: 13 }}>
              Carica altre
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
