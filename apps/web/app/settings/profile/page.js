'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { CITIES, INTERESTS_OPTIONS } from '@lets-night/shared';

export default function EditProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [myId, setMyId] = useState(null);
  const [originalUsername, setOriginalUsername] = useState('');
  const [form, setForm] = useState({
    display_name: '',
    username: '',
    bio: '',
    city: 'Milano',
    interests: [],
  });

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login?next=/settings/profile'); return; }
      setMyId(session.user.id);
      const { data } = await supabase
        .from('profiles')
        .select('display_name, full_name, username, bio, city, interests')
        .eq('id', session.user.id).maybeSingle();
      if (data) {
        setForm({
          display_name: data.display_name || data.full_name || '',
          username: data.username || '',
          bio: data.bio || '',
          city: data.city || 'Milano',
          interests: data.interests || [],
        });
        setOriginalUsername(data.username || '');
      }
      setLoading(false);
    }
    load();
  }, [router]);

  function update(k, v) {
    setForm(s => ({ ...s, [k]: v }));
    if (k === 'username') setUsernameError('');
  }
  function toggleInterest(t) {
    setForm(s => ({
      ...s,
      interests: s.interests.includes(t) ? s.interests.filter(x => x !== t) : [...s.interests, t],
    }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setError(''); setUsernameError('');
    const username = form.username.trim().toLowerCase();
    if (username && !/^[a-z0-9_.]{3,20}$/.test(username)) {
      setUsernameError('Username: 3-20 caratteri, solo lettere, numeri, _ e .');
      return;
    }
    setSaving(true);
    if (username && username !== originalUsername.toLowerCase()) {
      const { data: existing } = await supabase
        .from('profiles').select('id').ilike('username', username).neq('id', myId).maybeSingle();
      if (existing) {
        setUsernameError('Username già in uso.');
        setSaving(false);
        return;
      }
    }
    const { error: err } = await supabase
      .from('profiles')
      .update({
        display_name: form.display_name.trim() || null,
        username: username || null,
        bio: form.bio.trim() || null,
        city: form.city,
        interests: form.interests,
      })
      .eq('id', myId);
    setSaving(false);
    if (err) { setError('Errore: ' + err.message); return; }
    router.push('/dashboard');
  }

  if (loading) return <div className="dash-loading">Caricamento...</div>;

  return (
    <div className="settings-page">
      <nav className="lnav solid">
        <Link href="/" className="ln-logo">Let&apos;s<span>Night</span></Link>
        <div className="ln-menu">
          <Link href="/dashboard">Profilo</Link>
        </div>
      </nav>

      <div className="settings-container">
        <h1 className="settings-title">Modifica profilo</h1>

        {error && <div className="auth-error" style={{ marginBottom: 16 }}>{error}</div>}

        <form onSubmit={handleSave} className="settings-section">
          <div className="auth-field" style={{ marginBottom: 16 }}>
            <label>Display name</label>
            <input type="text" value={form.display_name}
              onChange={e => update('display_name', e.target.value)}
              placeholder="Es. Mattia S." />
          </div>

          <div className="auth-field" style={{ marginBottom: 16 }}>
            <label>Username (opzionale)</label>
            <input type="text" value={form.username}
              onChange={e => update('username', e.target.value)}
              placeholder="mattia.s" autoCapitalize="none" />
            {usernameError && <span style={{ color: '#fca5a5', fontSize: 12 }}>{usernameError}</span>}
          </div>

          <div className="auth-field" style={{ marginBottom: 16 }}>
            <label>Bio</label>
            <textarea value={form.bio} onChange={e => update('bio', e.target.value)}
              placeholder="Una breve descrizione di te..." rows={3}
              style={{
                background: 'var(--dark3)', border: '1.5px solid var(--border)',
                borderRadius: 8, padding: '11px 14px', color: '#fff', fontSize: 14,
                outline: 'none', fontFamily: 'inherit', resize: 'vertical',
              }} />
          </div>

          <div className="auth-field" style={{ marginBottom: 16 }}>
            <label>Città</label>
            <select value={form.city} onChange={e => update('city', e.target.value)}>
              {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="auth-field" style={{ marginBottom: 16 }}>
            <label>Interessi nightlife</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {INTERESTS_OPTIONS.map(t => (
                <button key={t} type="button"
                  onClick={() => toggleInterest(t)}
                  className={`adv-filter-chip ${form.interests.includes(t) ? 'active' : ''}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <button type="submit" className="auth-submit" disabled={saving}>
            {saving ? 'Salvataggio...' : 'Salva modifiche'}
          </button>
        </form>
      </div>
    </div>
  );
}
