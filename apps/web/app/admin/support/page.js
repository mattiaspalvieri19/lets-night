'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

const CAT_LABELS = {
  booking: 'Prenotazione',
  payment: 'Pagamento/Rimborso',
  account: 'Accesso/Account',
  event: 'Evento/Locale',
  bug: 'Bug app',
  other: 'Altro',
};

const STATUS_LABELS = {
  open: 'Aperto',
  in_progress: 'In lavorazione',
  waiting_user: 'In attesa utente',
  resolved: 'Risolto',
  closed: 'Chiuso',
};

const STATUS_ORDER = ['open', 'in_progress', 'waiting_user', 'resolved', 'closed'];
const LANGS = ['it', 'en', 'es', 'fr'];

export default function AdminSupportPage() {
  const [tab, setTab] = useState('tickets');
  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem' }}>
      <div className="admin-filters" style={{ marginBottom: '1.5rem' }}>
        <button onClick={() => setTab('tickets')} className={tab === 'tickets' ? 'biz-toggle active' : 'biz-toggle'}>Ticket</button>
        <button onClick={() => setTab('faq')} className={tab === 'faq' ? 'biz-toggle active' : 'biz-toggle'}>FAQ</button>
      </div>
      {tab === 'tickets' ? <TicketsPanel /> : <FaqPanel />}
    </div>
  );
}

function TicketsPanel() {
  const [loading, setLoading] = useState(true);
  const [adminId, setAdminId] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [fStatus, setFStatus] = useState('');
  const [fCategory, setFCategory] = useState('');

  const load = useCallback(async () => {
    let q = supabase
      .from('support_tickets')
      .select('*, profiles(full_name), events(title)')
      .order('updated_at', { ascending: false });
    if (fStatus) q = q.eq('status', fStatus);
    if (fCategory) q = q.eq('category', fCategory);
    const { data, error } = await q;
    if (error) console.error('Errore ticket admin:', error);
    setTickets(data || []);
  }, [fStatus, fCategory]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setAdminId(session?.user?.id || null);
    })();
  }, []);

  useEffect(() => {
    (async () => { setLoading(true); await load(); setLoading(false); })();
  }, [load]);

  if (loading) return <div className="dash-loading">Caricamento ticket...</div>;

  return (
    <div className="dash-section">
      <h2 className="dash-section-title">Ticket di assistenza ({tickets.length})</h2>
      <div className="admin-filters">
        <select value={fStatus} onChange={e => setFStatus(e.target.value)}>
          <option value="">Tutti gli stati</option>
          {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <select value={fCategory} onChange={e => setFCategory(e.target.value)}>
          <option value="">Tutte le categorie</option>
          {Object.entries(CAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {tickets.length === 0 ? (
        <div className="dash-empty"><p>Nessun ticket.</p></div>
      ) : (
        <div className="biz-events-list">
          {tickets.map(tk => {
            const isOpen = expanded === tk.id;
            return (
              <div key={tk.id} className="biz-event-item" style={{ flexDirection: 'column', alignItems: 'stretch', cursor: 'pointer' }} onClick={() => setExpanded(isOpen ? null : tk.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                  <div className="biz-event-info">
                    <h3>{tk.subject}</h3>
                    <div className="biz-event-meta">
                      <span>{tk.profiles?.full_name || 'Utente'}</span>
                      <span>{CAT_LABELS[tk.category] || tk.category}</span>
                      <span>{STATUS_LABELS[tk.status] || tk.status}</span>
                      {tk.events?.title && <span>Evento: {tk.events.title}</span>}
                      <span>{tk.updated_at ? new Date(tk.updated_at).toLocaleString('it-IT') : '-'}</span>
                    </div>
                  </div>
                  <span style={{ color: 'var(--text2)', fontSize: 12 }}>{isOpen ? '▲' : '▼'}</span>
                </div>
                {isOpen && (
                  <div onClick={e => e.stopPropagation()}>
                    <TicketThread ticket={tk} adminId={adminId} onChanged={load} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TicketThread({ ticket, adminId, onChanged }) {
  const [messages, setMessages] = useState([]);
  const [sigUrls, setSigUrls] = useState({});
  const [reply, setReply] = useState('');
  const [status, setStatus] = useState(ticket.status);
  const [busy, setBusy] = useState(false);

  const loadMessages = useCallback(async () => {
    const { data } = await supabase
      .from('support_messages')
      .select('*')
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: true });
    const list = data || [];
    setMessages(list);
    const withAtt = list.filter(m => m.attachment_path);
    if (withAtt.length) {
      const entries = await Promise.all(withAtt.map(async m => {
        const { data: s } = await supabase.storage.from('support-attachments').createSignedUrl(m.attachment_path, 3600);
        return [m.id, s?.signedUrl];
      }));
      setSigUrls(Object.fromEntries(entries.filter(([, u]) => u)));
    }
  }, [ticket.id]);

  useEffect(() => { loadMessages(); }, [loadMessages]);
  useEffect(() => { setStatus(ticket.status); }, [ticket.status]);

  async function sendReply() {
    const body = reply.trim();
    if (!body || busy) return;
    setBusy(true);
    const { error } = await supabase.from('support_messages').insert({
      ticket_id: ticket.id, sender: 'admin', author_id: adminId, body,
    });
    setBusy(false);
    if (error) { alert('Errore invio: ' + error.message); return; }
    setReply('');
    // Il trigger porta lo stato a "waiting_user" e notifica l'utente.
    await loadMessages();
    onChanged();
  }

  async function changeStatus(next) {
    if (next === status || busy) return;
    setBusy(true);
    const { error } = await supabase.from('support_tickets').update({ status: next, updated_at: new Date().toISOString() }).eq('id', ticket.id);
    setBusy(false);
    if (error) { alert('Errore stato: ' + error.message); return; }
    setStatus(next);
    onChanged();
  }

  return (
    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
      <div className="biz-event-meta" style={{ marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '.8rem' }}>
        <span>App: {ticket.app_version || '—'}</span>
        <span>OS: {ticket.platform || '—'}</span>
        <span>Lingua: {ticket.locale || '—'}</span>
        <span>Aperto: {ticket.created_at ? new Date(ticket.created_at).toLocaleString('it-IT') : '-'}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '.8rem', marginBottom: '1rem' }}>
        {messages.map(m => {
          const admin = m.sender === 'admin';
          const att = sigUrls[m.id];
          return (
            <div key={m.id} style={{ alignSelf: admin ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
              <div style={{ color: 'var(--text2)', fontSize: 11, marginBottom: 4, textAlign: admin ? 'right' : 'left' }}>
                {admin ? 'Assistenza' : (ticket.profiles?.full_name || 'Utente')} · {m.created_at ? new Date(m.created_at).toLocaleString('it-IT') : ''}
              </div>
              <div style={{ background: admin ? 'var(--purple)' : 'rgba(255,255,255,.04)', border: '1px solid var(--border)', borderRadius: 12, padding: '.7rem .9rem', color: '#fff', fontSize: 14, lineHeight: 1.5 }}>
                {m.body}
                {att && (
                  <a href={att} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 8 }}>
                    <img src={att} alt="screenshot" style={{ maxWidth: 220, borderRadius: 8, border: '1px solid var(--border)' }} />
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <textarea
        value={reply}
        onChange={e => setReply(e.target.value)}
        placeholder="Scrivi una risposta..."
        rows={3}
        style={{ width: '100%', background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', borderRadius: 8, padding: '.7rem', color: '#fff', fontSize: 14, resize: 'vertical', marginBottom: '.7rem' }}
      />
      <div style={{ display: 'flex', gap: '.7rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={sendReply} className="biz-toggle active" disabled={busy || !reply.trim()}>Invia risposta</button>
        <select value={status} onChange={e => changeStatus(e.target.value)} disabled={busy}>
          {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
      </div>
    </div>
  );
}

function FaqPanel() {
  const [loading, setLoading] = useState(true);
  const [faqs, setFaqs] = useState([]);
  const [busy, setBusy] = useState(false);
  const empty = { id: null, lang: 'it', category: '', question: '', answer: '', sort_order: 0 };
  const [form, setForm] = useState(empty);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('support_faq')
      .select('*')
      .order('lang', { ascending: true })
      .order('sort_order', { ascending: true });
    if (error) console.error('Errore FAQ admin:', error);
    setFaqs(data || []);
  }, []);

  useEffect(() => {
    (async () => { setLoading(true); await load(); setLoading(false); })();
  }, [load]);

  async function save() {
    if (!form.question.trim() || !form.answer.trim()) { alert('Domanda e risposta obbligatorie.'); return; }
    setBusy(true);
    const payload = {
      lang: form.lang,
      category: form.category.trim() || 'other',
      question: form.question.trim(),
      answer: form.answer.trim(),
      sort_order: Number(form.sort_order) || 0,
    };
    const res = form.id
      ? await supabase.from('support_faq').update(payload).eq('id', form.id)
      : await supabase.from('support_faq').insert(payload);
    setBusy(false);
    if (res.error) { alert('Errore: ' + res.error.message); return; }
    setForm(empty);
    load();
  }

  async function toggleActive(f) {
    const { error } = await supabase.from('support_faq').update({ is_active: !f.is_active }).eq('id', f.id);
    if (error) { alert('Errore: ' + error.message); return; }
    load();
  }

  async function remove(f) {
    if (!confirm('Eliminare questa FAQ?')) return;
    const { error } = await supabase.from('support_faq').delete().eq('id', f.id);
    if (error) { alert('Errore: ' + error.message); return; }
    if (form.id === f.id) setForm(empty);
    load();
  }

  if (loading) return <div className="dash-loading">Caricamento FAQ...</div>;

  return (
    <>
      <div className="dash-section" style={{ marginBottom: '2rem' }}>
        <h2 className="dash-section-title">{form.id ? 'Modifica FAQ' : 'Nuova FAQ'}</h2>
        <div className="admin-filters" style={{ marginBottom: '.8rem' }}>
          <select value={form.lang} onChange={e => setForm({ ...form, lang: e.target.value })}>
            {LANGS.map(l => <option key={l} value={l}>{l.toUpperCase()}</option>)}
          </select>
          <input placeholder="Categoria (es. Prenotazioni)" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
          <input type="number" placeholder="Ordine" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: e.target.value })} style={{ maxWidth: 110 }} />
        </div>
        <input placeholder="Domanda" value={form.question} onChange={e => setForm({ ...form, question: e.target.value })}
          style={{ width: '100%', background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', borderRadius: 8, padding: '.7rem', color: '#fff', fontSize: 14, marginBottom: '.7rem' }} />
        <textarea placeholder="Risposta" value={form.answer} onChange={e => setForm({ ...form, answer: e.target.value })} rows={4}
          style={{ width: '100%', background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', borderRadius: 8, padding: '.7rem', color: '#fff', fontSize: 14, resize: 'vertical', marginBottom: '.7rem' }} />
        <div style={{ display: 'flex', gap: '.7rem' }}>
          <button onClick={save} className="biz-toggle active" disabled={busy}>{form.id ? 'Salva modifiche' : 'Aggiungi FAQ'}</button>
          {form.id && <button onClick={() => setForm(empty)} className="ln-btn-ghost" style={{ background: 'transparent', border: '1px solid var(--border)', padding: '8px 18px', borderRadius: 8, color: 'var(--text2)', cursor: 'pointer', fontSize: 13 }}>Annulla</button>}
        </div>
      </div>

      <div className="dash-section">
        <h2 className="dash-section-title">FAQ pubblicate ({faqs.length})</h2>
        {faqs.length === 0 ? (
          <div className="dash-empty"><p>Nessuna FAQ. Aggiungine una qui sopra.</p></div>
        ) : (
          <div className="biz-events-list">
            {faqs.map(f => (
              <div key={f.id} className="biz-event-item">
                <div className="biz-event-info">
                  <h3 style={{ opacity: f.is_active ? 1 : 0.5 }}>{f.question}</h3>
                  <div className="biz-event-meta">
                    <span>{f.lang.toUpperCase()}</span>
                    <span>{f.category}</span>
                    <span>Ordine {f.sort_order}</span>
                    {!f.is_active && <span style={{ color: '#fbbf24' }}>Disattivata</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '.5rem' }}>
                  <button onClick={() => setForm({ id: f.id, lang: f.lang, category: f.category, question: f.question, answer: f.answer, sort_order: f.sort_order })} className="biz-toggle">Modifica</button>
                  <button onClick={() => toggleActive(f)} className="biz-toggle">{f.is_active ? 'Disattiva' : 'Attiva'}</button>
                  <button onClick={() => remove(f)} className="admin-danger-btn">Elimina</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
