'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { isActiveBooking, sumRevenue, categorizeEntries } from '@lets-night/shared';

function todayLocal() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function daysAgoIso(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [venues, setVenues] = useState([]);
  const [counts, setCounts] = useState({ users: null, newUsers: null, pendingVenues: 0, pendingRefunds: 0, openTickets: 0, anomalies: 0 });
  const [fVenue, setFVenue] = useState('');
  const [tab, setTab] = useState('active'); // 'active' = eventi in corso/futuri | 'history' = conclusi

  useEffect(() => {
    (async () => {
      const [
        { data: evs, error: evErr },
        { data: bks },
        { data: vs },
        { count: usersCount },
        newUsersRes,
        { count: pendingVenues },
        { count: pendingRefunds },
        openTicketsRes,
        anomaliesRes,
      ] = await Promise.all([
        supabase.from('events').select('id, venue_id, title, event_date, capacity, booked_count, is_active'),
        supabase.from('bookings')
          .select('status, checked_in, refund_reason, total_price, booking_type, created_at, events!inner(id, venue_id, title, event_date)'),
        supabase.from('venues').select('id, name, is_verified'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        // profiles.created_at potrebbe non esistere: in caso di errore il KPI sparisce.
        supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', daysAgoIso(30)),
        supabase.from('venues').select('id', { count: 'exact', head: true }).eq('is_verified', false),
        supabase.from('bookings').select('id', { count: 'exact', head: true })
          .not('refund_requested_at', 'is', null)
          .not('status', 'in', '("cancelled","denied")'),
        // support_tickets potrebbe non esistere finché la migration non è applicata: in errore il KPI sparisce.
        supabase.from('support_tickets').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_progress']),
        // audit_logs idem: problemi (warn+error) degli ultimi 7 giorni.
        supabase.from('audit_logs').select('id', { count: 'exact', head: true }).neq('severity', 'info').gte('created_at', daysAgoIso(7)),
      ]);
      if (evErr) console.error('Errore dashboard admin:', evErr);
      setEvents(evs || []);
      setBookings(bks || []);
      setVenues(vs || []);
      setCounts({
        users: usersCount ?? null,
        newUsers: newUsersRes.error ? null : (newUsersRes.count ?? null),
        pendingVenues: pendingVenues || 0,
        pendingRefunds: pendingRefunds || 0,
        openTickets: openTicketsRes.error ? 0 : (openTicketsRes.count || 0),
        anomalies: anomaliesRes.error ? 0 : (anomaliesRes.count || 0),
      });
      setLoading(false);
    })();
  }, []);

  const d = useMemo(() => {
    const today = todayLocal();
    const base = fVenue ? events.filter(e => e.venue_id === fVenue) : events;
    const evs = base.filter(e => (tab === 'history' ? e.event_date < today : e.event_date >= today));
    const ids = new Set(evs.map(e => e.id));
    const scoped = bookings.filter(b => ids.has(b.events?.id));
    const bks = scoped.filter(isActiveBooking);

    // Storico: card per-evento (venduti/entrati/rifiutati/no-show, incasso, riempimento)
    const pastCards = tab !== 'history' ? [] : evs
      .slice().sort((a, b) => (a.event_date < b.event_date ? 1 : -1))
      .map(e => {
        const list = scoped.filter(b => b.events?.id === e.id);
        const cat = categorizeEntries(list, today);
        return {
          id: e.id, title: e.title, date: e.event_date,
          incasso: sumRevenue(list),
          riempimento: e.capacity ? Math.round(((e.booked_count || 0) / e.capacity) * 100) : null,
          ...cat,
        };
      });

    const attivi = evs.filter(e => e.is_active).length;
    const futuri = evs.filter(e => e.is_active && e.event_date >= today).length;
    const passati = evs.filter(e => e.event_date < today).length;
    const soldout = evs.filter(e => e.capacity && e.booked_count >= e.capacity).length;

    const incasso = bks.reduce((s, b) => s + Number(b.total_price || 0), 0);
    const incassoTavoli = bks.filter(b => b.booking_type === 'table_share').reduce((s, b) => s + Number(b.total_price || 0), 0);

    const withCap = evs.filter(e => e.capacity > 0);
    const sumBooked = withCap.reduce((s, e) => s + (e.booked_count || 0), 0);
    const sumCap = withCap.reduce((s, e) => s + e.capacity, 0);
    const riempimento = sumCap ? Math.round((sumBooked / sumCap) * 100) : null;

    const byVenue = {};
    for (const b of bks) {
      const vid = b.events?.venue_id;
      if (!vid) continue;
      byVenue[vid] ||= { count: 0, total: 0 };
      byVenue[vid].count++;
      byVenue[vid].total += Number(b.total_price || 0);
    }
    const venueRows = Object.entries(byVenue)
      .map(([vid, v]) => ({ id: vid, name: venues.find(x => x.id === vid)?.name || 'Locale', ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    const byEvent = {};
    for (const b of bks) {
      const eid = b.events?.id;
      if (!eid) continue;
      byEvent[eid] ||= { title: b.events.title, date: b.events.event_date, count: 0, total: 0 };
      byEvent[eid].count++;
      byEvent[eid].total += Number(b.total_price || 0);
    }
    const topEvents = Object.values(byEvent).sort((a, b) => b.total - a.total).slice(0, 5);

    return { attivi, futuri, passati, soldout, prenotazioni: bks.length, incasso, incassoTavoli, riempimento, venueRows, topEvents, pastCards };
  }, [events, bookings, venues, fVenue, tab]);

  if (loading) return <div className="dash-loading">Caricamento dashboard...</div>;

  const daGestire = counts.pendingVenues + counts.pendingRefunds + counts.openTickets + counts.anomalies;

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem' }}>
      {daGestire > 0 && (
        <div className="dash-section" style={{ marginBottom: '2rem', border: '1px solid rgba(251,191,36,.3)', borderRadius: 12, padding: '1.2rem' }}>
          <h2 className="dash-section-title" style={{ color: '#fbbf24' }}>Da gestire</h2>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {counts.pendingVenues > 0 && (
              <Link href="/admin/venues" style={{ color: '#fff', fontSize: 14 }}>
                {counts.pendingVenues} {counts.pendingVenues === 1 ? 'locale in attesa' : 'locali in attesa'} di approvazione →
              </Link>
            )}
            {counts.pendingRefunds > 0 && (
              <Link href="/admin/bookings" style={{ color: '#fff', fontSize: 14 }}>
                {counts.pendingRefunds} {counts.pendingRefunds === 1 ? 'richiesta di rimborso' : 'richieste di rimborso'} →
              </Link>
            )}
            {counts.openTickets > 0 && (
              <Link href="/admin/support" style={{ color: '#fff', fontSize: 14 }}>
                {counts.openTickets} ticket da gestire →
              </Link>
            )}
            {counts.anomalies > 0 && (
              <Link href="/admin/registro" style={{ color: '#f87171', fontSize: 14 }}>
                {counts.anomalies} {counts.anomalies === 1 ? 'anomalia nel registro' : 'anomalie nel registro'} (7gg) →
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="admin-filters">
        <select value={fVenue} onChange={e => setFVenue(e.target.value)}>
          <option value="">Tutti i locali</option>
          {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <button onClick={() => setTab('active')} className={tab === 'active' ? 'biz-toggle active' : 'biz-toggle'}>In corso</button>
        <button onClick={() => setTab('history')} className={tab === 'history' ? 'biz-toggle active' : 'biz-toggle'}>Storico</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.8rem', marginBottom: '2rem' }}>
        {[
          ['Incasso', `€ ${d.incasso.toFixed(0)}`],
          ['di cui tavoli', `€ ${d.incassoTavoli.toFixed(0)}`],
          ['Prenotazioni', d.prenotazioni],
          ['Riempimento medio', d.riempimento != null ? `${d.riempimento}%` : '—'],
          ['Eventi attivi', d.attivi],
          ['Eventi futuri', d.futuri],
          ['Eventi passati', d.passati],
          ['Sold out', d.soldout],
          ['Utenti totali', counts.users ?? '—'],
          ...(counts.newUsers != null ? [['Nuovi utenti (30gg)', counts.newUsers]] : []),
          ['Locali verificati', venues.filter(v => v.is_verified).length],
          ['Locali in attesa', counts.pendingVenues],
          ['Ticket aperti', counts.openTickets],
        ].map(([lab, val]) => (
          <div key={lab} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', borderRadius: 10, padding: '1rem' }}>
            <div style={{ color: '#fff', fontSize: 22, fontWeight: 800 }}>{val}</div>
            <div style={{ color: 'var(--text2)', fontSize: 11, marginTop: 4 }}>{lab}</div>
          </div>
        ))}
      </div>

      {tab === 'history' && (
        <div className="dash-section" style={{ marginBottom: '2rem' }}>
          <h2 className="dash-section-title">Eventi conclusi ({d.pastCards.length})</h2>
          {d.pastCards.length === 0 ? (
            <div className="dash-empty"><p>Nessun evento concluso.</p></div>
          ) : (
            <div className="biz-events-list">
              {d.pastCards.map(e => (
                <div key={e.id} className="biz-event-item">
                  <div className="biz-event-info">
                    <h3>{e.title}</h3>
                    <div className="biz-event-meta">
                      <span>{e.date}</span>
                      <span>{e.venduti} venduti</span>
                      <span style={{ color: '#4ade80' }}>{e.entrati} entrati</span>
                      <span style={{ color: '#f87171' }}>{e.rifiutati} rifiutati</span>
                      <span style={{ color: '#fbbf24' }}>{e.noShow} no-show</span>
                      <span>€ {e.incasso.toFixed(2)}</span>
                      {e.riempimento != null && <span>{e.riempimento}% riempimento</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="dash-section" style={{ marginBottom: '2rem' }}>
        <h2 className="dash-section-title">Incassi per locale</h2>
        {d.venueRows.length === 0 ? (
          <div className="dash-empty"><p>Nessuna prenotazione.</p></div>
        ) : (
          <div className="biz-events-list">
            {d.venueRows.map(v => (
              <div key={v.id} className="biz-event-item">
                <div className="biz-event-info">
                  <h3>{v.name}</h3>
                  <div className="biz-event-meta">
                    <span>{v.count} prenotazioni</span>
                    <span>€ {v.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="dash-section">
        <h2 className="dash-section-title">Top eventi</h2>
        {d.topEvents.length === 0 ? (
          <div className="dash-empty"><p>Nessun dato.</p></div>
        ) : (
          <div className="biz-events-list">
            {d.topEvents.map((e, i) => (
              <div key={i} className="biz-event-item">
                <div className="biz-event-info">
                  <h3>{e.title}</h3>
                  <div className="biz-event-meta">
                    <span>{e.date}</span>
                    <span>{e.count} prenotazioni</span>
                    <span>€ {e.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
