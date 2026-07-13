'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

// Registro (audit_logs): la scatola nera soldi+frode. Sola lettura per design —
// le righe le scrivono solo il server e i trigger; da qui si consulta e basta.

const TYPE_LABELS = {
  payment_fulfilled: 'Pagamento completato',
  payment_anomaly_refund: 'Anomalia pagamento (auto-rimborso)',
  payment_orphan: 'Pagamento orfano',
  webhook_event: 'Evento Stripe',
  refund_requested: 'Richiesta rimborso',
  refund_resolved: 'Richiesta rimborso decisa',
  refund_done: 'Rimborso eseguito',
  refund_failed: 'Rimborso fallito',
  chargeback: 'Chargeback',
  scan_rejected: 'Scan rifiutato',
  scan_duplicate: 'QR già scannerizzato',
  booking_created: 'Prenotazione creata',
  booking_cancelled: 'Prenotazione annullata',
  booking_denied: 'Ingresso negato',
  booking_status_change: 'Cambio stato prenotazione',
  booking_deleted: 'Prenotazione eliminata',
  checkin_set: 'Check-in',
  checkin_removed: 'Check-in rimosso',
  qr_invalidated: 'QR invalidato',
  event_price_changed: 'Prezzo evento modificato',
};

const SEVERITY_META = {
  info: { label: 'Info', color: '#60a5fa' },
  warn: { label: 'Attenzione', color: '#fbbf24' },
  error: { label: 'Errore', color: '#f87171' },
};

function daysAgoIso(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export default function AdminRegistroPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [expanded, setExpanded] = useState(null);
  // Default: solo i problemi (warn+error). Gli "info" sono la cronaca completa.
  const [fView, setFView] = useState('problems');
  const [fType, setFType] = useState('');
  const [fDays, setFDays] = useState('30');
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    let q = supabase
      .from('audit_logs')
      .select('*')
      .gte('created_at', daysAgoIso(Number(fDays) || 30))
      .order('created_at', { ascending: false })
      .limit(200);
    if (fView === 'problems') q = q.neq('severity', 'info');
    if (fType) q = q.eq('type', fType);
    const { data, error } = await q;
    if (error) {
      // Tabella non ancora creata (migration da applicare): pagina informativa, non rotta.
      console.error('Errore registro admin:', error);
      setMissing(true);
      setRows([]);
      return;
    }
    setMissing(false);
    setRows(data || []);
  }, [fView, fType, fDays]);

  useEffect(() => {
    (async () => { setLoading(true); await load(); setLoading(false); })();
  }, [load]);

  if (loading) return <div className="dash-loading">Caricamento registro...</div>;

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem' }}>
      <div className="dash-section">
        <h2 className="dash-section-title">Registro ({rows.length})</h2>
        <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: '1rem' }}>
          Memoria permanente dei movimenti legati a soldi e frode. Sola lettura: le righe non si modificano né si cancellano.
        </p>

        <div className="admin-filters">
          <button onClick={() => setFView('problems')} className={fView === 'problems' ? 'biz-toggle active' : 'biz-toggle'}>Problemi</button>
          <button onClick={() => setFView('all')} className={fView === 'all' ? 'biz-toggle active' : 'biz-toggle'}>Tutto</button>
          <select value={fType} onChange={e => setFType(e.target.value)}>
            <option value="">Tutti i tipi</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={fDays} onChange={e => setFDays(e.target.value)}>
            <option value="7">Ultimi 7 giorni</option>
            <option value="30">Ultimi 30 giorni</option>
            <option value="90">Ultimi 90 giorni</option>
            <option value="365">Ultimo anno</option>
          </select>
        </div>

        {missing ? (
          <div className="dash-empty">
            <p>Registro non ancora attivo: applicare la migration <code>20260713_audit_logs.sql</code> nel SQL editor di Supabase.</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="dash-empty">
            <p>{fView === 'problems' ? 'Nessun problema nel periodo. 🎉' : 'Nessuna voce nel periodo.'}</p>
          </div>
        ) : (
          <div className="biz-events-list">
            {rows.map(r => {
              const sev = SEVERITY_META[r.severity] || SEVERITY_META.info;
              const isOpen = expanded === r.id;
              return (
                <div
                  key={r.id}
                  className="biz-event-item"
                  style={{ flexDirection: 'column', alignItems: 'stretch', cursor: 'pointer', borderLeft: `3px solid ${sev.color}` }}
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                    <div className="biz-event-info">
                      <h3 style={{ fontSize: 15 }}>{TYPE_LABELS[r.type] || r.type}</h3>
                      <div className="biz-event-meta">
                        <span style={{ color: sev.color }}>{sev.label}</span>
                        <span>{new Date(r.created_at).toLocaleString('it-IT')}</span>
                        {r.message && <span>{r.message}</span>}
                      </div>
                    </div>
                    <span style={{ color: 'var(--text2)', fontSize: 12 }}>{isOpen ? '▲' : '▼'}</span>
                  </div>
                  {isOpen && (
                    <div onClick={e => e.stopPropagation()} style={{ marginTop: '.8rem', fontSize: 12, color: 'var(--text2)' }}>
                      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '.5rem' }}>
                        {r.booking_id && <span>Prenotazione: <code>{r.booking_id}</code></span>}
                        {r.event_id && <span>Evento: <code>{r.event_id}</code></span>}
                        {r.user_id && <span>Utente: <code>{r.user_id}</code></span>}
                        {r.actor_id && <span>Autore azione: <code>{r.actor_id}</code></span>}
                        {!r.actor_id && <span>Autore azione: server</span>}
                      </div>
                      {r.details && (
                        <pre style={{ background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)', borderRadius: 8, padding: '.7rem', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {JSON.stringify(r.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
