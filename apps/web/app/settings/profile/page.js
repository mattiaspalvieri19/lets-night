'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { CITIES, INTERESTS_OPTIONS } from '@lets-night/shared';
import Navbar from '../../../components/Navbar';

function initialOf(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
}

export default function EditProfilePage() {
  const router = useRouter();
  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [success, setSuccess] = useState(false);
  const [myId, setMyId] = useState(null);

  const [form, setForm] = useState({
    display_name: '',
    username: '',
    bio: '',
    phone: '',
    gender: '',
    city: 'Milano',
    interests: [],
  });
  const [birthDate, setBirthDate] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [originalUsername, setOriginalUsername] = useState('');
  const [originalPhone, setOriginalPhone] = useState('');

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login?next=/settings/profile'); return; }
      setMyId(session.user.id);
      const { data } = await supabase
        .from('profiles')
        .select('display_name, full_name, username, bio, city, interests, phone, gender, birth_date, avatar_url')
        .eq('id', session.user.id)
        .maybeSingle();
      if (data) {
        setForm({
          display_name: data.display_name || data.full_name || '',
          username: data.username || '',
          bio: data.bio || '',
          phone: data.phone || '',
          gender: data.gender || '',
          city: data.city || 'Milano',
          interests: data.interests || [],
        });
        setOriginalUsername(data.username || '');
        setOriginalPhone(data.phone || '');
        setBirthDate(data.birth_date || null);
        setAvatarUrl(data.avatar_url || null);
      }
      setLoading(false);
    }
    load();
  }, [router]);

  function update(k, v) {
    setForm(s => ({ ...s, [k]: v }));
    if (k === 'username') setUsernameError('');
    setSuccess(false);
  }

  function toggleInterest(t) {
    setForm(s => ({
      ...s,
      interests: s.interests.includes(t) ? s.interests.filter(x => x !== t) : [...s.interests, t],
    }));
    setSuccess(false);
  }

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file || !myId) return;
    setUploadingAvatar(true);
    setError('');
    try {
      const ext = file.name.split('.').pop().toLowerCase() || 'jpg';
      const path = `${myId}/avatar.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { contentType: file.type, upsert: true });
      if (uploadErr) { setError('Impossibile caricare la foto. Riprova.'); return; }
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', myId);
      setAvatarUrl(`${publicUrl}?t=${Date.now()}`);
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setError(''); setUsernameError(''); setSuccess(false);

    const username = form.username.trim().toLowerCase();
    if (username && !/^[a-z0-9_.]{3,20}$/.test(username)) {
      setUsernameError('3-20 caratteri, solo lettere, numeri, _ e .');
      return;
    }
    const phone = form.phone.trim();
    if (phone && !/^\+?[\d\s\-()]{7,20}$/.test(phone)) {
      setError('Numero di telefono non valido.');
      return;
    }

    setSaving(true);

    if (username && username !== originalUsername.toLowerCase()) {
      const { data: avail } = await supabase.rpc('check_username_available', { p_username: username });
      if (avail === false) {
        setUsernameError('Username già in uso.');
        setSaving(false);
        return;
      }
    }

    if (phone && phone !== originalPhone) {
      const { data: avail, error: rpcErr } = await supabase.rpc('check_phone_available', { p_phone: phone });
      if (rpcErr || avail == null) {
        setError('Verifica telefono non riuscita. Riprova.');
        setSaving(false);
        return;
      }
      if (avail === false) {
        setError('Numero già associato a un altro account.');
        setSaving(false);
        return;
      }
    }

    const { error: err } = await supabase.from('profiles').update({
      display_name: form.display_name.trim() || null,
      username: username || null,
      bio: form.bio.trim() || null,
      phone: phone || null,
      gender: form.gender || null,
      city: form.city,
      interests: form.interests,
    }).eq('id', myId);

    setSaving(false);
    if (err) { setError('Errore: ' + err.message); return; }
    setSuccess(true);
    setOriginalUsername(username);
    setOriginalPhone(phone);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (loading) return <div className="dash-loading">Caricamento...</div>;

  const displayName = form.display_name || '?';

  return (
    <div className="settings-page">
      <Navbar />
      <div className="settings-container">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <Link href="/settings" style={{ color: 'var(--text2)', fontSize: 13, textDecoration: 'none' }}>
            ← Impostazioni
          </Link>
        </div>
        <h1 className="settings-title">Modifica profilo</h1>

        {error && <div className="auth-error" style={{ marginBottom: 16 }}>{error}</div>}
        {success && (
          <div style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#4ade80', fontSize: 13 }}>
            Profilo salvato.
          </div>
        )}

        {/* Avatar */}
        <div className="settings-section" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" style={{ width: 80, height: 80, borderRadius: 40, objectFit: 'cover', border: '2px solid rgba(168,85,247,0.5)' }} />
            ) : (
              <div style={{ width: 80, height: 80, borderRadius: 40, background: 'rgba(168,85,247,0.18)', border: '2px solid rgba(168,85,247,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 900, color: '#A855F7' }}>
                {initialOf(displayName)}
              </div>
            )}
          </div>
          <div>
            <p style={{ color: '#fff', fontWeight: 600, fontSize: 14, margin: '0 0 4px' }}>Foto profilo</p>
            <p style={{ color: 'var(--text2)', fontSize: 12, margin: '0 0 10px' }}>JPG, PNG o WebP · Max 5MB</p>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarChange} style={{ display: 'none' }} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(168,85,247,0.4)', background: 'transparent', color: '#A855F7', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              {uploadingAvatar ? 'Caricamento...' : 'Cambia foto'}
            </button>
          </div>
        </div>

        <form onSubmit={handleSave}>
          <div className="settings-section">
            <h3>Informazioni pubbliche</h3>

            <div className="auth-field" style={{ marginBottom: 14 }}>
              <label>Nome visualizzato</label>
              <input type="text" value={form.display_name} onChange={e => update('display_name', e.target.value)} placeholder="Es. Mattia S." />
            </div>

            <div className="auth-field" style={{ marginBottom: 4 }}>
              <label>Username (opzionale)</label>
              <input type="text" value={form.username} onChange={e => update('username', e.target.value)} placeholder="mattia.s" autoCapitalize="none" />
            </div>
            {usernameError && <p style={{ color: '#fca5a5', fontSize: 12, margin: '0 0 10px' }}>{usernameError}</p>}

            <div className="auth-field" style={{ marginBottom: 14 }}>
              <label>Bio</label>
              <textarea value={form.bio} onChange={e => update('bio', e.target.value)} placeholder="Una breve descrizione di te..." rows={3}
                style={{ background: 'var(--dark3)', border: '1.5px solid var(--border)', borderRadius: 8, padding: '11px 14px', color: '#fff', fontSize: 14, outline: 'none', fontFamily: 'inherit', resize: 'vertical', width: '100%', boxSizing: 'border-box' }} />
            </div>

            <div className="auth-field" style={{ marginBottom: 14 }}>
              <label>Interessi nightlife</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                {INTERESTS_OPTIONS.map(t => (
                  <button key={t} type="button" onClick={() => toggleInterest(t)}
                    className={`adv-filter-chip ${form.interests.includes(t) ? 'active' : ''}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="settings-section">
            <h3>Dati personali</h3>

            <div className="auth-row">
              <div className="auth-field">
                <label>Telefono</label>
                <input type="tel" value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="+39 340..." />
              </div>
              <div className="auth-field">
                <label>Sesso</label>
                <select value={form.gender} onChange={e => update('gender', e.target.value)}>
                  <option value="">Non specificato</option>
                  <option value="M">Uomo</option>
                  <option value="F">Donna</option>
                  <option value="X">Altro</option>
                </select>
              </div>
            </div>

            <div className="auth-row">
              <div className="auth-field">
                <label>Città</label>
                <select value={form.city} onChange={e => update('city', e.target.value)}>
                  {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="auth-field">
                <label>Data di nascita</label>
                <input type="text" value={birthDate
                  ? new Date(birthDate + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })
                  : 'Non impostata'} disabled
                  style={{ opacity: 0.5, cursor: 'not-allowed' }} />
              </div>
            </div>
          </div>

          <button type="submit" className="auth-submit" disabled={saving}>
            {saving ? 'Salvataggio...' : 'Salva modifiche'}
          </button>
          <p style={{ color: 'var(--text2)', fontSize: 11, textAlign: 'center', marginTop: 10 }}>
            Email non modificabile. <Link href="/settings/password" style={{ color: 'var(--purple-light)' }}>Cambia password →</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
