'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';

export default function BusinessLogin() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      if (error.message.includes('Email not confirmed')) {
        setError('Devi prima confermare la tua email.');
      } else if (error.message.includes('Invalid login credentials')) {
        setError('Email o password errati.');
      } else {
        setError(error.message);
      }
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single();

    if (profile?.role !== 'business') {
      setError('Questo account non e registrato come business. Usa il login utenti.');
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }

    router.push('/business/dashboard');
  }

  return (
    <div className="auth-page biz-auth-page">
      <Link href="/business" className="auth-back">Torna al business portal</Link>
      <div className="auth-card biz-auth-card">
        <div className="auth-logo">Let&apos;s<span>Night</span> <span className="biz-tag">Business</span></div>
        <h1 className="auth-title">Accedi al <em>tuo locale</em></h1>
        <p className="auth-sub">Gestisci eventi, prenotazioni e statistiche.</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>

          <div className="auth-field">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="biz-submit" disabled={loading}>
            {loading ? 'Accesso...' : 'Accedi'}
          </button>
        </form>

        <div className="auth-footer">
          Non sei ancora registrato? <Link href="/business/register">Registra il tuo locale</Link>
        </div>
      </div>
    </div>
  );
}
