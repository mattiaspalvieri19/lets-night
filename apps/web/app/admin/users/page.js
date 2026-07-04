'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';

const PAGE_SIZE = 50;

export default function AdminUsersPage() {
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState({});

  const loadProfiles = useCallback(async (pageIndex) => {
    let q = supabase
      .from('profiles')
      .select('id, display_name, full_name, username, phone, city, role, loyalty_points, avatar_url')
      .order('full_name', { ascending: true })
      .range(pageIndex * PAGE_SIZE, pageIndex * PAGE_SIZE + PAGE_SIZE);
    const s = search.trim();
    if (s) q = q.or(`full_name.ilike.%${s}%,username.ilike.%${s}%,phone.ilike.%${s}%`);
    const { data, error } = await q;
    if (error) { console.error('Errore utenti admin:', error); return []; }
    const rows = data || [];
    setHasMore(rows.length > PAGE_SIZE);
    return rows.slice(0, PAGE_SIZE);
  }, [search]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const rows = await loadProfiles(0);
      setProfiles(rows);
      setPage(0);
      setLoading(false);
    })();
  }, [loadProfiles]);

  async function loadMore() {
    const next = page + 1;
    const rows = await loadProfiles(next);
    setProfiles(prev => [...prev, ...rows]);
    setPage(next);
  }

  async function openDetail(p) {
    if (expanded === p.id) { setExpanded(null); return; }
    setExpanded(p.id);
    if (detail[p.id]) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const [infoRes, { data: bks }] = await Promise.all([
      fetch('/api/admin/user-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: p.id, accessToken: session.access_token }),
      }),
      supabase.from('bookings')
        .select('id, status, checked_in, total_price, created_at, events(title, event_date)')
        .eq('user_id', p.id)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    const info = infoRes.ok ? await infoRes.json() : null;
    setDetail(prev => ({ ...prev, [p.id]: { info, bookings: bks || [] } }));
  }

  if (loading) return <div className="dash-loading">Caricamento utenti...</div>;

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem' }}>
      <div className="dash-section">
        <h2 className="dash-section-title">Utenti</h2>
        <div className="admin-filters">
          <input placeholder="Cerca per nome, username o telefono..." value={search} onChange={e => setSearch(e.target.value)} style={{ minWidth: 280 }} />
        </div>

        {profiles.length === 0 ? (
          <div className="dash-empty"><p>Nessun utente trovato.</p></div>
        ) : (
          <div className="biz-events-list">
            {profiles.map(p => {
              const isOpen = expanded === p.id;
              const d = detail[p.id];
              return (
                <div key={p.id} className="biz-event-item" style={{ flexDirection: 'column', alignItems: 'stretch', cursor: 'pointer' }} onClick={() => openDetail(p)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                      {p.avatar_url && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={p.avatar_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                      )}
                      <div className="biz-event-info">
                        <h3>{p.display_name || p.full_name || 'Senza nome'}</h3>
                        <div className="biz-event-meta">
                          {p.username && <span>@{p.username}</span>}
                          <span style={{ color: p.role === 'business' ? '#fbbf24' : 'var(--text2)' }}>{p.role === 'business' ? 'Business' : 'Utente'}</span>
                          {p.city && <span>{p.city}</span>}
                          {p.phone && <span>{p.phone}</span>}
                          <span>{p.loyalty_points || 0} punti</span>
                        </div>
                      </div>
                    </div>
                    <span style={{ color: 'var(--text2)', fontSize: 12 }}>{isOpen ? '▲' : '▼'}</span>
                  </div>
                  {isOpen && (
                    <div onClick={e => e.stopPropagation()} style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                      {!d ? (
                        <p style={{ color: 'var(--text2)', fontSize: 13 }}>Caricamento dettagli...</p>
                      ) : (
                        <>
                          <div className="biz-event-meta" style={{ display: 'flex', flexWrap: 'wrap', gap: '.8rem', marginBottom: '1rem' }}>
                            {d.info ? (
                              <>
                                <span>Email: {d.info.email}</span>
                                <span>Registrato: {d.info.created_at ? new Date(d.info.created_at).toLocaleDateString('it-IT') : '-'}</span>
                                <span>Ultimo accesso: {d.info.last_sign_in_at ? new Date(d.info.last_sign_in_at).toLocaleString('it-IT') : '-'}</span>
                                <span>{d.info.email_confirmed_at ? 'Email confermata' : 'Email NON confermata'}</span>
                              </>
                            ) : (
                              <span>Dati account non disponibili.</span>
                            )}
                            <Link href={`/user/${p.id}`} style={{ color: 'var(--purple-light)' }}>Profilo pubblico →</Link>
                          </div>
                          <p style={{ color: '#fff', fontSize: 13, fontWeight: 600, marginBottom: '.5rem' }}>Ultime prenotazioni ({d.bookings.length})</p>
                          {d.bookings.length === 0 ? (
                            <p style={{ color: 'var(--text2)', fontSize: 13 }}>Nessuna prenotazione.</p>
                          ) : (
                            d.bookings.map(b => (
                              <div key={b.id} className="biz-event-meta" style={{ display: 'flex', gap: '.8rem', padding: '.35rem 0', flexWrap: 'wrap' }}>
                                <span>{b.events?.title || 'Evento'}</span>
                                <span>{b.events?.event_date || '-'}</span>
                                <span>€ {(Number(b.total_price) || 0).toFixed(2)}</span>
                                <span>{b.status}</span>
                                {b.checked_in && <span style={{ color: '#4ade80' }}>Entrato</span>}
                              </div>
                            ))
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {hasMore && (
          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <button onClick={loadMore} style={{ background: 'transparent', border: '1px solid var(--border)', padding: '10px 24px', borderRadius: 8, color: 'var(--text2)', cursor: 'pointer', fontSize: 13 }}>
              Carica altri
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
