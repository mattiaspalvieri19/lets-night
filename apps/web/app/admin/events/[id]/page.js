'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../../lib/supabase';
import { CATS_NO_TUTTI, activeBookings, sumRevenue, NOSHOW_REFUND_RE } from '@lets-night/shared';

const MAX_COVER_MB = 5;
const EMPTY_TYPE = { name: '', total_price: '', max_people: '8', includes: '', tables_count: '1' };
const EMPTY_TICKET = { name: '', description: '', price: '', drinks_included: '0', quantity: '', is_active: true };

function todayLocal() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export default function AdminEventDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [types, setTypes] = useState([]);
  const [tables, setTables] = useState([]);

  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState('');

  const [newType, setNewType] = useState(EMPTY_TYPE);
  const [editTypes, setEditTypes] = useState({});
  const [ticketTypes, setTicketTypes] = useState([]);
  const [newTicket, setNewTicket] = useState(EMPTY_TICKET);
  const [editTickets, setEditTickets] = useState({});
  const [combineSel, setCombineSel] = useState([]);
  const [combineCount, setCombineCount] = useState('1');
  const [combineName, setCombineName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: ev, error }, { data: bks }, { data: tts }, { data: tbs }, { data: tks }] = await Promise.all([
      supabase.from('events').select('*, venues(id, name, zona, city)').eq('id', id).maybeSingle(),
      supabase.from('bookings').select('status, checked_in, refund_reason, total_price, stripe_session_id, ticket_type_id, quantity').eq('event_id', id),
      supabase.from('event_table_types').select('*').eq('event_id', id).order('created_at'),
      supabase.from('event_tables').select('*, event_table_types(name)').eq('event_id', id).order('created_at', { ascending: false }),
      supabase.from('event_ticket_types').select('*').eq('event_id', id).order('sort_order').order('price'),
    ]);
    if (error) console.error('Errore evento admin:', error);
    setEvent(ev || null);
    if (ev) {
      setForm({
        title: ev.title || '',
        description: ev.description || '',
        category: ev.category || 'Discoteca',
        event_date: ev.event_date || '',
        event_time: (ev.event_time || '').slice(0, 5),
        end_time: (ev.end_time || '').slice(0, 5),
        price: ev.price != null ? String(ev.price) : '',
        capacity: ev.capacity != null ? String(ev.capacity) : '',
        is_active: !!ev.is_active,
      });
    }
    setBookings(bks || []);
    setTypes(tts || []);
    setTables(tbs || []);
    setTicketTypes(tks || []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    (async () => { await load(); })();
  }, [load]);

  if (loading) return <div className="dash-loading">Caricamento evento...</div>;
  if (!event) return (
    <div className="dash-loading">
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: 'var(--text2)' }}>Evento non trovato.</p>
        <Link href="/admin/events" style={{ color: 'var(--purple-light)' }}>Torna agli eventi</Link>
      </div>
    </div>
  );

  const today = todayLocal();
  const concluded = event.event_date < today;
  const active = activeBookings(bookings);
  let entrati = 0, rifiutati = 0, noShow = 0;
  for (const b of bookings) {
    if (b.status === 'denied') rifiutati++;
    else if (b.checked_in) entrati++;
    else if (concluded && (b.status === 'confirmed' || (b.status === 'cancelled' && NOSHOW_REFUND_RE.test(b.refund_reason || '')))) noShow++;
  }
  const venduti = entrati + rifiutati + noShow;
  const incasso = sumRevenue(active);
  const riempimento = event.capacity ? Math.round(((event.booked_count || 0) / event.capacity) * 100) : null;

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })); setMsg(''); }

  async function handleSave(e) {
    e.preventDefault();
    if (saving) return;
    if (!form.title.trim() || !form.event_date || !form.event_time) {
      setMsg('Titolo, data e ora di inizio sono obbligatori.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('events').update({
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category,
      event_date: form.event_date,
      event_time: form.event_time,
      end_time: form.end_time || null,
      price: form.price === '' ? 0 : Number(form.price),
      capacity: form.capacity === '' ? null : Number(form.capacity),
      is_active: form.is_active,
    }).eq('id', event.id);
    setSaving(false);
    if (error) { setMsg('Errore: ' + error.message); return; }
    setMsg('Evento salvato.');
    load();
  }

  async function handleCoverUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_COVER_MB * 1024 * 1024) {
      setMsg(`La foto è troppo grande (max ${MAX_COVER_MB}MB).`);
      return;
    }
    setUploading(true);
    setMsg('');
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${event.venue_id}/event-${event.id}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('venue-covers')
        .upload(path, file, { contentType: file.type, upsert: true });
      if (uploadErr) { setMsg('Impossibile caricare la copertina. Riprova.'); return; }
      const { data: { publicUrl } } = supabase.storage.from('venue-covers').getPublicUrl(path);
      const { error: upErr } = await supabase.from('events')
        .update({ cover_image: `${publicUrl}?v=${Date.now()}` })
        .eq('id', event.id);
      if (upErr) { setMsg('Copertina caricata ma non salvata. Riprova.'); return; }
      setMsg('Copertina aggiornata.');
      load();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // ── Tipologie di INGRESSO ──────────────────────────────────────────────
  async function addTicketType(e) {
    e.preventDefault();
    if (!newTicket.name.trim() || newTicket.price === '') { alert('Nome e prezzo sono obbligatori.'); return; }
    const { error } = await supabase.from('event_ticket_types').insert({
      event_id: event.id,
      name: newTicket.name.trim(),
      description: newTicket.description.trim() || null,
      price: Number(newTicket.price),
      drinks_included: Number(newTicket.drinks_included) || 0,
      quantity: newTicket.quantity === '' ? null : Number(newTicket.quantity),
      is_active: newTicket.is_active,
    });
    if (error) { alert('Errore: ' + error.message); return; }
    setNewTicket(EMPTY_TICKET);
    load();
  }

  async function saveTicketType(tk) {
    const edit = editTickets[tk.id];
    if (!edit) return;
    const { error } = await supabase.from('event_ticket_types').update({
      name: edit.name.trim(),
      description: edit.description.trim() || null,
      price: Number(edit.price),
      drinks_included: Number(edit.drinks_included) || 0,
      quantity: edit.quantity === '' ? null : Number(edit.quantity),
      is_active: edit.is_active,
    }).eq('id', tk.id);
    if (error) { alert('Errore: ' + error.message); return; }
    setEditTickets(prev => { const n = { ...prev }; delete n[tk.id]; return n; });
    load();
  }

  async function deleteTicketType(tk) {
    if (!confirm(`Eliminare la tipologia di ingresso "${tk.name}"?`)) return;
    const { error } = await supabase.from('event_ticket_types').delete().eq('id', tk.id);
    if (error) {
      if (error.code === '23503') alert('Impossibile eliminare: ci sono prenotazioni con questa tipologia. Disattivala per fermare la vendita.');
      else alert('Errore: ' + error.message);
      return;
    }
    load();
  }

  async function addType(e) {
    e.preventDefault();
    if (!newType.name.trim() || newType.total_price === '') { alert('Nome e prezzo sono obbligatori.'); return; }
    const { error } = await supabase.from('event_table_types').insert({
      event_id: event.id,
      name: newType.name.trim(),
      total_price: Number(newType.total_price),
      max_people: Number(newType.max_people) || 8,
      includes: newType.includes.trim() || null,
      tables_count: Number(newType.tables_count) || 1,
    });
    if (error) { alert('Errore: ' + error.message); return; }
    setNewType(EMPTY_TYPE);
    load();
  }

  async function saveType(t) {
    const edit = editTypes[t.id];
    if (!edit) return;
    const { error } = await supabase.from('event_table_types').update({
      name: edit.name.trim(),
      total_price: Number(edit.total_price),
      max_people: Number(edit.max_people),
      includes: edit.includes.trim() || null,
      tables_count: Number(edit.tables_count),
    }).eq('id', t.id);
    if (error) { alert('Errore: ' + error.message); return; }
    setEditTypes(prev => { const n = { ...prev }; delete n[t.id]; return n; });
    load();
  }

  async function deleteType(t) {
    if (!confirm(`Eliminare la tipologia "${t.name}"?`)) return;
    const { error } = await supabase.from('event_table_types').delete().eq('id', t.id);
    if (error) {
      if (error.code === '23503') alert('Impossibile eliminare: questa tipologia ha tavoli già aperti.');
      else alert('Errore: ' + error.message);
      return;
    }
    load();
  }

  function toggleCombine(typeId) {
    setCombineSel(prev => prev.includes(typeId) ? prev.filter(x => x !== typeId) : [...prev, typeId]);
  }

  async function doCombine() {
    if (combineSel.length < 2) { alert('Seleziona almeno 2 tipologie da combinare.'); return; }
    const n = Number(combineCount);
    if (!n || n < 1) { alert('Indica quanti tavoli combinati creare.'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('admin_combine_table_types', {
      p_event_id: event.id,
      p_source_type_ids: combineSel,
      p_tables_count: n,
      p_name: combineName.trim() || null,
    });
    setBusy(false);
    if (error) {
      const map = {
        INSUFFICIENT_FREE_TABLES: 'Una delle tipologie non ha abbastanza tavoli liberi.',
        CANNOT_COMBINE_COMBINED: 'Non si può combinare una tipologia già combinata.',
        NEED_AT_LEAST_TWO_TYPES: 'Servono almeno 2 tipologie.',
      };
      alert(map[error.message] || 'Errore: ' + error.message);
      return;
    }
    const sumPeople = types.filter(t => combineSel.includes(t.id)).reduce((s, t) => s + t.max_people, 0);
    if (sumPeople > 30) alert('Nota: i posti del tavolo combinato sono stati limitati a 30 (massimo di sistema).');
    setCombineSel([]);
    setCombineCount('1');
    setCombineName('');
    load();
  }

  async function dissolveType(t) {
    if (!confirm(`Sciogliere "${t.name}"? I tavoli tornano alle tipologie di origine.`)) return;
    setBusy(true);
    const { error } = await supabase.rpc('admin_dissolve_combined_type', { p_type_id: t.id });
    setBusy(false);
    if (error) {
      if (error.message === 'TYPE_HAS_TABLES') alert('Impossibile sciogliere: esistono tavoli aperti su questa tipologia.');
      else alert('Errore: ' + error.message);
      return;
    }
    load();
  }

  async function deleteEvent() {
    const activeCount = active.length;
    if (activeCount > 0) {
      alert(`Questo evento ha ${activeCount} prenotazioni attive: non può essere eliminato. Puoi disattivarlo per nasconderlo dall'app.`);
      return;
    }
    if (!confirm('Eliminare definitivamente questo evento? L\'azione è irreversibile.')) return;
    const { error } = await supabase.from('events').delete().eq('id', event.id);
    if (error) {
      if (error.code === '23503') alert('Impossibile eliminare: esistono prenotazioni o tavoli collegati. Disattiva l\'evento invece di eliminarlo.');
      else alert('Errore: ' + error.message);
      return;
    }
    router.push('/admin/events');
  }

  const inputStyle = { background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff', padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', width: '100%' };
  const labelStyle = { color: 'var(--text2)', fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem' }}>
      <Link href="/admin/events" style={{ color: 'var(--text2)', fontSize: 13 }}>← Tutti gli eventi</Link>
      <h1 style={{ color: '#fff', fontSize: 26, fontWeight: 800, margin: '1rem 0 .3rem' }}>{event.title}</h1>
      <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: '2rem' }}>
        {event.venues?.name} · {event.venues?.zona}, {event.venues?.city} · {event.event_date}
      </p>

      <div className="dash-section" style={{ marginBottom: '2rem' }}>
        <h2 className="dash-section-title">Statistiche</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '.8rem' }}>
          {[
            ['Venduti', venduti],
            ['Entrati', entrati],
            ['Rifiutati', rifiutati],
            ['No-show', concluded ? noShow : '—'],
            ['Incasso', `€ ${incasso.toFixed(2)}`],
            ['Riempimento', riempimento != null ? `${riempimento}%` : '—'],
          ].map(([lab, val]) => (
            <div key={lab} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', borderRadius: 10, padding: '1rem' }}>
              <div style={{ color: '#fff', fontSize: 22, fontWeight: 800 }}>{val}</div>
              <div style={{ color: 'var(--text2)', fontSize: 11, marginTop: 4 }}>{lab}</div>
            </div>
          ))}
        </div>
        {!concluded && <p style={{ color: 'var(--text2)', fontSize: 12, marginTop: '.8rem' }}>Il conteggio no-show compare a evento concluso.</p>}
      </div>

      <div className="dash-section" style={{ marginBottom: '2rem' }}>
        <h2 className="dash-section-title">Modifica evento</h2>
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          <div>
            {event.cover_image ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={event.cover_image} alt="Cover" style={{ width: 200, height: 120, borderRadius: 10, objectFit: 'cover' }} />
            ) : (
              <div style={{ width: 200, height: 120, borderRadius: 10, background: 'rgba(255,255,255,.04)', border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', fontSize: 12 }}>
                Nessuna copertina
              </div>
            )}
          </div>
          <div style={{ alignSelf: 'center' }}>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleCoverUpload} style={{ display: 'none' }} id="cover-input" />
            <button type="button" onClick={() => fileInputRef.current?.click()} className="biz-toggle" disabled={uploading}>
              {uploading ? 'Caricamento...' : 'Cambia copertina'}
            </button>
          </div>
        </div>

        <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Titolo</label>
            <input style={inputStyle} value={form.title} onChange={e => setField('title', e.target.value)} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Descrizione</label>
            <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={form.description} onChange={e => setField('description', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Categoria</label>
            <select style={inputStyle} value={form.category} onChange={e => setField('category', e.target.value)}>
              {CATS_NO_TUTTI.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Data</label>
            <input type="date" style={inputStyle} value={form.event_date} onChange={e => setField('event_date', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Inizio</label>
            <input type="time" style={inputStyle} value={form.event_time} onChange={e => setField('event_time', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Fine</label>
            <input type="time" style={inputStyle} value={form.end_time} onChange={e => setField('end_time', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Prezzo (€)</label>
            <input type="number" min="0" step="0.5" style={{ ...inputStyle, opacity: ticketTypes.some(tk => tk.is_active) ? 0.5 : 1 }} value={form.price} onChange={e => setField('price', e.target.value)} disabled={ticketTypes.some(tk => tk.is_active)} />
            {ticketTypes.some(tk => tk.is_active) && (
              <p style={{ color: 'var(--text2)', fontSize: 11, marginTop: 4 }}>Gestito dalle tipologie di ingresso (minimo attivo).</p>
            )}
          </div>
          <div>
            <label style={labelStyle}>Capienza</label>
            <input type="number" min="0" style={inputStyle} value={form.capacity} onChange={e => setField('capacity', e.target.value)} />
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '.6rem' }}>
            <input type="checkbox" id="is-active" checked={form.is_active} onChange={e => setField('is_active', e.target.checked)} />
            <label htmlFor="is-active" style={{ color: '#fff', fontSize: 14 }}>Evento attivo (visibile nell&apos;app)</label>
          </div>
          {msg && <p style={{ gridColumn: '1 / -1', color: msg.startsWith('Errore') || msg.includes('Riprova') || msg.includes('obbligator') || msg.includes('grande') ? '#f87171' : '#4ade80', fontSize: 13 }}>{msg}</p>}
          <div style={{ gridColumn: '1 / -1' }}>
            <button type="submit" className="biz-toggle active" disabled={saving}>{saving ? 'Salvataggio...' : 'Salva modifiche'}</button>
          </div>
        </form>
      </div>

      <div className="dash-section" style={{ marginBottom: '2rem' }}>
        <h2 className="dash-section-title">Tipologie di ingresso ({ticketTypes.length})</h2>
        <p style={{ color: 'var(--text2)', fontSize: 12, marginBottom: '1rem' }}>
          Con almeno una tipologia attiva, il prezzo dell&apos;evento mostrato in app è il minimo attivo (sincronizzato in automatico); senza tipologie vale il prezzo base.
        </p>
        {ticketTypes.map(tk => {
          const edit = editTickets[tk.id];
          const sold = bookings
            .filter(b => b.ticket_type_id === tk.id && b.status !== 'cancelled' && b.status !== 'denied')
            .reduce((s, b) => s + (Number(b.quantity) || 1), 0);
          return (
            <div key={tk.id} className="biz-event-item" style={{ flexDirection: 'column', alignItems: 'stretch', opacity: tk.is_active ? 1 : 0.55 }}>
              {edit ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '.6rem' }}>
                  <input style={inputStyle} value={edit.name} onChange={e => setEditTickets(p => ({ ...p, [tk.id]: { ...edit, name: e.target.value } }))} placeholder="Nome" />
                  <input style={inputStyle} type="number" min="0" step="0.5" value={edit.price} onChange={e => setEditTickets(p => ({ ...p, [tk.id]: { ...edit, price: e.target.value } }))} placeholder="Prezzo €" />
                  <input style={inputStyle} type="number" min="0" value={edit.drinks_included} onChange={e => setEditTickets(p => ({ ...p, [tk.id]: { ...edit, drinks_included: e.target.value } }))} placeholder="Drink inclusi" />
                  <input style={inputStyle} type="number" min="1" value={edit.quantity} onChange={e => setEditTickets(p => ({ ...p, [tk.id]: { ...edit, quantity: e.target.value } }))} placeholder="Disponibilità (vuota = illimitata)" />
                  <input style={{ ...inputStyle, gridColumn: '1 / -1' }} value={edit.description} onChange={e => setEditTickets(p => ({ ...p, [tk.id]: { ...edit, description: e.target.value } }))} placeholder="Descrizione (es. Ingresso con 2 drink entro mezzanotte)" />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', gridColumn: '1 / -1' }}>
                    <input type="checkbox" id={`tk-active-${tk.id}`} checked={edit.is_active} onChange={e => setEditTickets(p => ({ ...p, [tk.id]: { ...edit, is_active: e.target.checked } }))} />
                    <label htmlFor={`tk-active-${tk.id}`} style={{ color: '#fff', fontSize: 13 }}>In vendita</label>
                  </div>
                  <div style={{ display: 'flex', gap: '.5rem', gridColumn: '1 / -1' }}>
                    <button onClick={() => saveTicketType(tk)} className="biz-toggle active">Salva</button>
                    <button onClick={() => setEditTickets(p => { const n = { ...p }; delete n[tk.id]; return n; })} className="biz-toggle">Annulla</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <div className="biz-event-info">
                    <h3>
                      {tk.name}
                      {!tk.is_active && <span className="admin-badge" style={{ marginLeft: 6 }}>Disattivata</span>}
                    </h3>
                    <div className="biz-event-meta">
                      <span>€ {Number(tk.price).toFixed(2)}</span>
                      {Number(tk.drinks_included) > 0 && <span>{tk.drinks_included} drink</span>}
                      <span>{tk.quantity != null ? `${sold}/${tk.quantity} venduti` : `${sold} venduti · illimitata`}</span>
                      {tk.description && <span>{tk.description}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '.5rem' }}>
                    <button onClick={() => setEditTickets(p => ({ ...p, [tk.id]: { name: tk.name, description: tk.description || '', price: String(tk.price), drinks_included: String(tk.drinks_included ?? 0), quantity: tk.quantity == null ? '' : String(tk.quantity), is_active: !!tk.is_active } }))} className="biz-toggle">Modifica</button>
                    <button onClick={() => deleteTicketType(tk)} className="admin-danger-btn">Elimina</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <form onSubmit={addTicketType} style={{ marginTop: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '.6rem' }}>
          <input style={inputStyle} value={newTicket.name} onChange={e => setNewTicket(p => ({ ...p, name: e.target.value }))} placeholder="Nome (es. Base, Premium, Lista)" />
          <input style={inputStyle} type="number" min="0" step="0.5" value={newTicket.price} onChange={e => setNewTicket(p => ({ ...p, price: e.target.value }))} placeholder="Prezzo €" />
          <input style={inputStyle} type="number" min="0" value={newTicket.drinks_included} onChange={e => setNewTicket(p => ({ ...p, drinks_included: e.target.value }))} placeholder="Drink inclusi" />
          <input style={inputStyle} type="number" min="1" value={newTicket.quantity} onChange={e => setNewTicket(p => ({ ...p, quantity: e.target.value }))} placeholder="Disponibilità (vuota = illimitata)" />
          <input style={{ ...inputStyle, gridColumn: '1 / -1' }} value={newTicket.description} onChange={e => setNewTicket(p => ({ ...p, description: e.target.value }))} placeholder="Descrizione (opzionale)" />
          <div style={{ gridColumn: '1 / -1' }}>
            <button type="submit" className="biz-toggle active">Aggiungi tipologia di ingresso</button>
          </div>
        </form>
      </div>

      <div className="dash-section" style={{ marginBottom: '2rem' }}>
        <h2 className="dash-section-title">Tipologie tavolo ({types.length})</h2>
        {types.map(t => {
          const edit = editTypes[t.id];
          const isCombined = !!t.combined_from;
          return (
            <div key={t.id} className="biz-event-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              {edit ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '.6rem' }}>
                  <input style={inputStyle} value={edit.name} onChange={e => setEditTypes(p => ({ ...p, [t.id]: { ...edit, name: e.target.value } }))} placeholder="Nome" />
                  <input style={inputStyle} type="number" min="0" value={edit.total_price} onChange={e => setEditTypes(p => ({ ...p, [t.id]: { ...edit, total_price: e.target.value } }))} placeholder="Prezzo €" />
                  <input style={inputStyle} type="number" min="1" max="30" value={edit.max_people} onChange={e => setEditTypes(p => ({ ...p, [t.id]: { ...edit, max_people: e.target.value } }))} placeholder="Posti" />
                  <input style={inputStyle} type="number" min="0" value={edit.tables_count} onChange={e => setEditTypes(p => ({ ...p, [t.id]: { ...edit, tables_count: e.target.value } }))} placeholder="N. tavoli" />
                  <input style={{ ...inputStyle, gridColumn: '1 / -1' }} value={edit.includes} onChange={e => setEditTypes(p => ({ ...p, [t.id]: { ...edit, includes: e.target.value } }))} placeholder="Cosa comprende" />
                  <div style={{ display: 'flex', gap: '.5rem', gridColumn: '1 / -1' }}>
                    <button onClick={() => saveType(t)} className="biz-toggle active">Salva</button>
                    <button onClick={() => setEditTypes(p => { const n = { ...p }; delete n[t.id]; return n; })} className="biz-toggle">Annulla</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <div className="biz-event-info">
                    <h3>
                      {!isCombined && (
                        <input type="checkbox" checked={combineSel.includes(t.id)} onChange={() => toggleCombine(t.id)} style={{ marginRight: 8 }} />
                      )}
                      {t.name} {isCombined && <span className="admin-badge" style={{ marginLeft: 6 }}>Combinato</span>}
                    </h3>
                    <div className="biz-event-meta">
                      <span>€ {Number(t.total_price).toFixed(0)}</span>
                      <span>{t.max_people} posti</span>
                      <span>{t.tables_count} tavoli</span>
                      {t.includes && <span>{t.includes}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '.5rem' }}>
                    <button onClick={() => setEditTypes(p => ({ ...p, [t.id]: { name: t.name, total_price: String(t.total_price), max_people: String(t.max_people), includes: t.includes || '', tables_count: String(t.tables_count) } }))} className="biz-toggle">Modifica</button>
                    {isCombined && <button onClick={() => dissolveType(t)} className="biz-toggle" disabled={busy}>Sciogli</button>}
                    <button onClick={() => deleteType(t)} className="admin-danger-btn">Elimina</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {combineSel.length >= 2 && (
          <div style={{ background: 'rgba(239,68,68,.05)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 10, padding: '1rem', marginTop: '1rem' }}>
            <p style={{ color: '#fff', fontSize: 13, fontWeight: 600, marginBottom: '.8rem' }}>
              Combina {combineSel.length} tipologie (prezzo = somma, posti = somma, max 30)
            </p>
            <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <input style={{ ...inputStyle, width: 100 }} type="number" min="1" value={combineCount} onChange={e => setCombineCount(e.target.value)} placeholder="N. tavoli" />
              <input style={{ ...inputStyle, width: 240 }} value={combineName} onChange={e => setCombineName(e.target.value)} placeholder="Nome (opzionale)" />
              <button onClick={doCombine} className="biz-toggle active" disabled={busy}>{busy ? 'Combino...' : 'Crea tavolo combinato'}</button>
            </div>
          </div>
        )}

        <form onSubmit={addType} style={{ marginTop: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '.6rem' }}>
          <input style={inputStyle} value={newType.name} onChange={e => setNewType(p => ({ ...p, name: e.target.value }))} placeholder="Nome tipologia" />
          <input style={inputStyle} type="number" min="0" value={newType.total_price} onChange={e => setNewType(p => ({ ...p, total_price: e.target.value }))} placeholder="Prezzo €" />
          <input style={inputStyle} type="number" min="1" max="30" value={newType.max_people} onChange={e => setNewType(p => ({ ...p, max_people: e.target.value }))} placeholder="Posti" />
          <input style={inputStyle} type="number" min="0" value={newType.tables_count} onChange={e => setNewType(p => ({ ...p, tables_count: e.target.value }))} placeholder="N. tavoli" />
          <input style={{ ...inputStyle, gridColumn: '1 / -1' }} value={newType.includes} onChange={e => setNewType(p => ({ ...p, includes: e.target.value }))} placeholder="Cosa comprende (opzionale)" />
          <div style={{ gridColumn: '1 / -1' }}>
            <button type="submit" className="biz-toggle active">Aggiungi tipologia</button>
          </div>
        </form>
      </div>

      <div className="dash-section" style={{ marginBottom: '2rem' }}>
        <h2 className="dash-section-title">Tavoli aperti ({tables.length})</h2>
        {tables.length === 0 ? (
          <div className="dash-empty"><p>Nessun tavolo aperto su questo evento.</p></div>
        ) : (
          <div className="biz-events-list">
            {tables.map(tb => (
              <div key={tb.id} className="biz-event-item">
                <div className="biz-event-info">
                  <h3>{tb.event_table_types?.name || 'Tavolo'}</h3>
                  <div className="biz-event-meta">
                    <span>{tb.people_count}/{tb.max_people} persone</span>
                    <span>€ {Number(tb.collected).toFixed(2)} / € {Number(tb.total_price).toFixed(2)} raccolti</span>
                    <span>{tb.status === 'open' ? 'Aperto' : tb.status === 'covered' ? 'Coperto' : 'Annullato'}</span>
                    <span>{tb.visibility === 'public' ? 'Pubblico' : 'Privato'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="dash-section" style={{ border: '1px solid rgba(239,68,68,.3)', borderRadius: 12, padding: '1.5rem' }}>
        <h2 className="dash-section-title" style={{ color: '#f87171' }}>Zona pericolosa</h2>
        <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: '1rem' }}>
          L&apos;eliminazione è definitiva. Se l&apos;evento ha prenotazioni attive, disattivalo invece di eliminarlo.
        </p>
        <button onClick={deleteEvent} className="admin-danger-btn">Elimina evento</button>
      </div>
    </div>
  );
}
