'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

export default function LoginPage() {
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
        setError('Devi prima confermare la tua email. Controlla la casella di posta.');
      } else if (error.message.includes('Invalid login credentials')) {
        setError('Email o password errati.');
      } else {
        setError(error.message);
      }
      setLoading(false);
      return;
    }

    // Controlla il ruolo dell utente
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single();

    if (profile?.role === 'business') {
      router.push('/business/dashboard');
    } else {
      router.push('/dashboard');
    }
  }

  return (
    <div className="auth-page">
      <Link href="/" className="auth-back">Torna alla home</Link>
      <div className="auth-card">
        <div className="auth-logo">Let&apos;s<span>Night</span></div>
        <h1 className="auth-title">Bentornato su <em>Let&apos;s Night</em></h1>
        <p className="auth-sub">Accedi per vedere le tue prenotazioni e gli eventi salvati.</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="mario@esempio.it" required />
          </div>

          <div className="auth-field">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'Accesso...' : 'Accedi'}
          </button>
        </form>

        <div className="auth-footer">
          Non hai ancora un account? <Link href="/register">Iscriviti gratis</Link>
        </div>

        <div className="auth-business-link">
          Sei un locale? <Link href="/business/login">Accedi come business</Link>
        </div>
      </div>
    </div>
  );
}
