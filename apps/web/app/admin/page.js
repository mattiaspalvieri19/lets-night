'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [venues, setVenues] = useState([]);
  const [refundReqs, setRefundReqs] = useState([]);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/login?next=/admin');
      return;
    }
    const { data: adminRow } = await supabase
      .from('admins')
      .select('user_id')
      .eq('user_id', session.user.id)
      .maybeSingle();
    if (!adminRow) {
      setAuthorized(false);
      setLoading(false);
      return;
    }
    setAuthorized(true);

    const { data } = await supabase.from('venues').select('*').order('created_at', { ascending: false });
    setVenues(data || []);

    // Richieste di rimborso no-show in attesa (l'admin può leggere tutte le bookings via RLS).
    const { data: rr } = await supabase
      .from('bookings')
      .select('id, total_price, fee, snapshot_full_name, refund_requested_at, refund_request_reason, events(title, event_date)')
      .not('refund_requested_at', 'is', null)
      .not('status', 'in', '("cancelled","denied")')
      .order('refund_requested_at', { ascending: true });
    setRefundReqs(rr || []);

    setLoading(false);
  }

  async function resolveRefund(bookingId, action, refund) {
    if (action === 'approve' && !confirm(`Approvare il rimborso di € ${(refund || 0).toFixed(2)}? L'importo verra rimborsato su Stripe.`)) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch('/api/refund/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId, accessToken: session.access_token, action }),
    });
    const json = await res.json();
    if (!res.ok) { alert(json.error || 'Operazione non riuscita.'); return; }
    loadData();
  }

  async function approveVenue(venueId) {
    const { error } = await supabase.from('venues').update({ is_verified: true }).eq('id', venueId);
    if (error) alert('Errore: ' + error.message);
    else loadData();
  }

  async function rejectVenue(venueId) {
    if (!confirm('Sicuro di voler eliminare questo locale? L\'azione e irreversibile.')) return;
    const { error } = await supabase.from('venues').delete().eq('id', venueId);
    if (error) alert('Errore: ' + error.message);
    else loadData();
  }

  async function unverifyVenue(venueId) {
    await supabase.from('venues').update({ is_verified: false }).eq('id', venueId);
    loadData();
  }

  if (loading) return <div className="dash-loading">Caricamento admin...</div>;
  if (!authorized) return (
    <div className="dash-loading">
      <div style={{textAlign:'center'}}>
        <h2 style={{color:'#fff', marginBottom:'1rem'}}>Accesso negato</h2>
        <p style={{color:'var(--text2)'}}>Questa pagina e riservata agli amministratori.</p>
        <Link href="/" style={{color:'var(--purple-light)', marginTop:'1rem', display:'inline-block'}}>Torna alla home</Link>
      </div>
    </div>
  );

  const pending = venues.filter(v => !v.is_verified);
  const approved = venues.filter(v => v.is_verified);

  return (
    <div className="dash-page">
      <nav className="lnav solid">
        <Link href="/" className="ln-logo">Let&apos;s<span>Night</span> <span className="biz-tag-nav" style={{background:'rgba(239,68,68,.15)', color:'#f87171'}}>Admin</span></Link>
      </nav>

      <div className="dash-hero">
        <div className="dash-label">Admin Panel</div>
        <h1 className="dash-title">Gestione <em>locali</em></h1>
        <p className="dash-sub">Approva o rifiuta le registrazioni dei locali.</p>
      </div>

      <div style={{maxWidth:'1100px', margin:'0 auto', padding:'2rem'}}>
        <div className="dash-section" style={{marginBottom:'2rem'}}>
          <h2 className="dash-section-title">Richieste di rimborso ({refundReqs.length})</h2>
          {refundReqs.length === 0 ? (
            <div className="dash-empty"><p>Nessuna richiesta di rimborso in attesa.</p></div>
          ) : (
            <div className="biz-events-list">
              {refundReqs.map(r => {
                const price = Number(r.total_price) || 0;
                const fee = Number(r.fee) || 0;
                const refund = Math.max(0, price - fee);
                return (
                  <div key={r.id} className="biz-event-item">
                    <div className="biz-event-info">
                      <h3>{r.snapshot_full_name || 'Utente'}</h3>
                      <div className="biz-event-meta">
                        <span>{r.events?.title || 'Evento'}</span>
                        <span>{r.events?.event_date || '-'}</span>
                        <span>Rimborso € {refund.toFixed(2)} (prezzo € {price.toFixed(2)} − fee € {fee.toFixed(2)})</span>
                      </div>
                    </div>
                    <div style={{display:'flex', gap:'.5rem'}}>
                      <button onClick={() => resolveRefund(r.id, 'approve', refund)} className="biz-toggle active">Approva rimborso</button>
                      <button onClick={() => resolveRefund(r.id, 'reject')} style={{padding:'8px 16px', background:'rgba(239,68,68,.15)', border:'1px solid rgba(239,68,68,.3)', color:'#f87171', borderRadius:'6px', fontSize:'12px', fontWeight:600}}>Rifiuta</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="dash-section" style={{marginBottom:'2rem'}}>
          <h2 className="dash-section-title">In attesa di approvazione ({pending.length})</h2>
          {pending.length === 0 ? (
            <div className="dash-empty"><p>Nessun locale in attesa.</p></div>
          ) : (
            <div className="biz-events-list">
              {pending.map(v => (
                <div key={v.id} className="biz-event-item">
                  <div className="biz-event-info">
                    <h3>{v.name}</h3>
                    <div className="biz-event-meta">
                      <span>{v.category}</span>
                      <span>{v.zona}, {v.city}</span>
                      <span>{v.contact_email}</span>
                      <span>{v.phone}</span>
                    </div>
                    {v.description && <p style={{color:'var(--text2)', fontSize:'13px', marginTop:'.5rem'}}>{v.description}</p>}
                  </div>
                  <div style={{display:'flex', gap:'.5rem'}}>
                    <button onClick={() => approveVenue(v.id)} className="biz-toggle active">Approva</button>
                    <button onClick={() => rejectVenue(v.id)} style={{padding:'8px 16px', background:'rgba(239,68,68,.15)', border:'1px solid rgba(239,68,68,.3)', color:'#f87171', borderRadius:'6px', fontSize:'12px', fontWeight:600}}>Rifiuta</button>
                  </div>
                </div>
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
                <div key={v.id} className="biz-event-item">
                  <div className="biz-event-info">
                    <h3>{v.name}</h3>
                    <div className="biz-event-meta">
                      <span>{v.category}</span>
                      <span>{v.zona}, {v.city}</span>
                      <span>{v.contact_email || '-'}</span>
                    </div>
                  </div>
                  <button onClick={() => unverifyVenue(v.id)} style={{padding:'8px 16px', background:'transparent', border:'1px solid var(--border)', color:'var(--text2)', borderRadius:'6px', fontSize:'12px'}}>Sospendi</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
