'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../../lib/supabase';
import { CATS_NO_TUTTI, CITIES } from '@lets-night/shared';

const MAX_COVER_MB = 5;

function safeUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return ['http:', 'https:'].includes(u.protocol) ? u.toString() : '';
  } catch { return ''; }
}

function normInstagram(v) {
  if (!v) return '';
  return v.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/+$/, '');
}

export default function BusinessVenueEdit() {
  const router = useRouter();
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [venue, setVenue] = useState(null);
  const [form, setForm] = useState({
    name: '', description: '', category: 'Discoteca',
    city: 'Milano', zona: '', address: '',
    phone: '', email: '', website: '', instagram: '',
  });
  const [coverUrl, setCoverUrl] = useState('');

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/business/login'); return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (prof?.role !== 'business') { router.push('/dashboard'); return; }
      const { data: v } = await supabase.from('venues').select('*').eq('owner_id', session.user.id).maybeSingle();
      if (!v) { router.push('/business/dashboard'); return; }
      setVenue(v);
      setForm({
        name: v.name || '',
        description: v.description || '',
        category: v.category || 'Discoteca',
        city: v.city || 'Milano',
        zona: v.zona || '',
        address: v.address || '',
        phone: v.phone || '',
        email: v.email || '',
        website: v.website || '',
        instagram: v.instagram || '',
      });
      setCoverUrl(v.cover_image || '');
      setLoading(false);
    })();
  }, [router]);

  function setField(k, v) {
    setForm(s => ({ ...s, [k]: v }));
    setSuccess(false);
    setError('');
  }

  async function handleCoverUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !venue) return;
    if (file.size > MAX_COVER_MB * 1024 * 1024) {
      setError(`La foto è troppo grande (max ${MAX_COVER_MB}MB).`);
      return;
    }
    setUploading(true);
    setError('');
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${venue.id}/cover.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('venue-covers')
        .upload(path, file, { contentType: file.type, upsert: true });
      if (uploadErr) { setError('Impossibile caricare la foto. Riprova.'); return; }
      const { data: { publicUrl } } = supabase.storage.from('venue-covers').getPublicUrl(path);
      const { error: upErr } = await supabase.from('venues').update({ cover_image: publicUrl }).eq('id', venue.id);
      if (upErr) { setError('Foto caricata ma non salvata. Riprova.'); return; }
      setCoverUrl(`${publicUrl}?t=${Date.now()}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleSave(e) {
    e?.preventDefault?.();
    if (saving) return;
    setError('');
    setSuccess(false);
    if (!form.name.trim()) { setError('Il nome del locale è obbligatorio.'); return; }
    if (!form.category) { setError('Seleziona una categoria.'); return; }
    if (!form.city) { setError('Seleziona una città.'); return; }

    const cleanWebsite = form.website ? safeUrl(form.website) : '';
    if (form.website && !cleanWebsite) {
      setError('Il sito web non è valido. Usa un URL http/https.');
      return;
    }

    setSaving(true);
    const patch = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      category: form.category,
      city: form.city,
      zona: form.zona.trim() || null,
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      website: cleanWebsite || null,
      instagram: normInstagram(form.instagram) || null,
    };
    const { error: upErr } = await supabase.from('venues').update(patch).eq('id', venue.id);
    setSaving(false);
    if (upErr) {
      setError('Salvataggio fallito. Riprova.');
      console.error(upErr);
      return;
    }
    setSuccess(true);
    setVenue(v => ({ ...v, ...patch }));
  }

  if (loading) return <div className="dash-loading">Caricamento...</div>;

  return (
    <div className="dash-page">
      <nav className="lnav solid biz-dash-nav">
        <Link href="/" className="ln-logo">Let&apos;s<span>Night</span> <span className="biz-tag-nav">Business</span></Link>
        <div className="ln-menu">
          <Link href="/business/dashboard">← Dashboard</Link>
        </div>
      </nav>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '2rem' }}>
        <div style={{ color: 'var(--purple-light)', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>
          Modifica locale
        </div>
        <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 900, margin: 0, marginBottom: 8 }}>{venue?.name}</h1>
        <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 28 }}>
          Modifica nome, descrizione, contatti e foto del tuo locale. Le modifiche sono visibili immediatamente sull&apos;app.
        </p>

        {/* Cover image */}
        <section className="dash-section" style={{ marginBottom: 20 }}>
          <h2 className="dash-section-title">Foto di copertina</h2>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{
              width: 200, height: 120, borderRadius: 12, overflow: 'hidden',
              background: coverUrl ? `url("${coverUrl}") center/cover` : 'linear-gradient(135deg, #1a0533, #0d0d1a)',
              border: '1px solid rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#64748B', fontSize: 12,
            }}>
              {!coverUrl && 'Nessuna foto'}
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleCoverUpload}
                disabled={uploading}
                style={{ display: 'none' }}
                id="cover-upload"
              />
              <label htmlFor="cover-upload" className="ln-btn-primary" style={{ display: 'inline-block', cursor: uploading ? 'wait' : 'pointer' }}>
                {uploading ? 'Caricamento...' : (coverUrl ? 'Cambia foto' : 'Carica foto')}
              </label>
              <p style={{ color: '#64748B', fontSize: 12, marginTop: 8 }}>JPG, PNG o WebP fino a {MAX_COVER_MB}MB. Consigliato 1200×750px.</p>
            </div>
          </div>
        </section>

        <form onSubmit={handleSave} className="dash-section">
          <h2 className="dash-section-title">Dati del locale</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
            <Field label="Nome" required>
              <input className="auth-input" value={form.name} onChange={e => setField('name', e.target.value)} maxLength={80} />
            </Field>

            <Field label="Descrizione">
              <textarea
                className="auth-input"
                value={form.description}
                onChange={e => setField('description', e.target.value)}
                rows={5}
                maxLength={1000}
                style={{ resize: 'vertical', minHeight: 100 }}
                placeholder="Racconta il tuo locale: atmosfera, musica, cosa lo rende unico..."
              />
              <Counter value={form.description.length} max={1000} />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
              <Field label="Categoria" required>
                <select className="auth-input" value={form.category} onChange={e => setField('category', e.target.value)}>
                  {CATS_NO_TUTTI.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              {CITIES.length > 1 && (
                <Field label="Città" required>
                  <select className="auth-input" value={form.city} onChange={e => setField('city', e.target.value)}>
                    {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Zona">
                <input className="auth-input" value={form.zona} onChange={e => setField('zona', e.target.value)} maxLength={50} placeholder="Es. Navigli, Brera" />
              </Field>
            </div>

            <Field label="Indirizzo">
              <input className="auth-input" value={form.address} onChange={e => setField('address', e.target.value)} maxLength={120} placeholder="Via Tortona 1" />
            </Field>
          </div>

          <h2 className="dash-section-title" style={{ marginTop: 30 }}>Contatti</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <Field label="Telefono">
              <input className="auth-input" type="tel" value={form.phone} onChange={e => setField('phone', e.target.value)} maxLength={30} placeholder="+39 ..." />
            </Field>
            <Field label="Email">
              <input className="auth-input" type="email" value={form.email} onChange={e => setField('email', e.target.value)} maxLength={120} placeholder="info@locale.it" />
            </Field>
            <Field label="Sito web">
              <input className="auth-input" value={form.website} onChange={e => setField('website', e.target.value)} maxLength={200} placeholder="https://..." />
            </Field>
            <Field label="Instagram">
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ color: '#64748B', padding: '0 8px' }}>@</span>
                <input className="auth-input" value={form.instagram} onChange={e => setField('instagram', e.target.value)} maxLength={50} placeholder="nome_locale" style={{ flex: 1 }} />
              </div>
            </Field>
          </div>

          {error && <div className="auth-error" style={{ marginTop: 18 }}>{error}</div>}
          {success && <div style={{
            marginTop: 18, padding: '10px 14px',
            background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)',
            borderRadius: 8, color: '#4ADE80', fontSize: 13, fontWeight: 600,
          }}>✓ Modifiche salvate.</div>}

          <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
            <button type="submit" disabled={saving} className="ln-btn-primary big">
              {saving ? 'Salvataggio...' : 'Salva modifiche'}
            </button>
            <Link href="/business/dashboard" className="ln-btn-ghost" style={{ alignSelf: 'center' }}>Annulla</Link>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label style={{ display: 'block', color: '#94a3b8', fontSize: 12, marginBottom: 6, fontWeight: 600 }}>
        {label}{required && <span style={{ color: '#f87171', marginLeft: 4 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function Counter({ value, max }) {
  const danger = value > max * 0.9;
  return (
    <div style={{ textAlign: 'right', fontSize: 11, color: danger ? '#FBBF24' : '#64748B', marginTop: 4 }}>
      {value}/{max}
    </div>
  );
}
