'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import Navbar from '../../../components/Navbar';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login?next=/settings/password');
    });
  }, [router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setSuccess(false);

    if (newPassword.length < 6) {
      setError('La password deve essere di almeno 6 caratteri.');
      return;
    }
    if (newPassword !== confirm) {
      setError('Le password non coincidono.');
      return;
    }

    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (err) {
      setError(err.message.includes('same password')
        ? 'La nuova password deve essere diversa da quella attuale.'
        : 'Impossibile aggiornare la password. Riprova.');
      return;
    }

    setSuccess(true);
    setNewPassword('');
    setConfirm('');
  }

  return (
    <div className="settings-page">
      <Navbar />
      <div className="settings-container">
        <div style={{ marginBottom: 6 }}>
          <Link href="/settings" style={{ color: 'var(--text2)', fontSize: 13, textDecoration: 'none' }}>
            ← Impostazioni
          </Link>
        </div>
        <h1 className="settings-title">Cambia password</h1>
        <p className="settings-sub">Scegli una password sicura di almeno 6 caratteri.</p>

        {error && <div className="auth-error" style={{ marginBottom: 16 }}>{error}</div>}
        {success && (
          <div style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#4ade80', fontSize: 13 }}>
            Password aggiornata. <Link href="/settings" style={{ color: '#4ade80', fontWeight: 700 }}>Torna alle impostazioni →</Link>
          </div>
        )}

        <form onSubmit={handleSubmit} className="settings-section">
          <div className="auth-field" style={{ marginBottom: 16 }}>
            <label>Nuova password</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Minimo 6 caratteri"
              required
              minLength={6}
            />
          </div>

          <div className="auth-field" style={{ marginBottom: 24 }}>
            <label>Conferma password</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Ripeti la password"
              required
            />
          </div>

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'Aggiornamento...' : 'Aggiorna password'}
          </button>
        </form>
      </div>
    </div>
  );
}
