'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

function safeNext(next) {
  if (!next || typeof next !== 'string') return null;
  return next.startsWith('/') && !next.startsWith('//') ? next : null;
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get('next'));
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

    const { data: adminRow } = await supabase.from('admins').select('user_id').eq('user_id', data.user.id).maybeSingle();
    if (adminRow) {
      router.push('/admin');
      return;
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single();

    if (next) {
      router.push(next);
    } else if (profile?.role === 'business') {
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
          Non hai ancora un account? <Link href={next ? `/register?next=${encodeURIComponent(next)}` : '/register'}>Iscriviti gratis</Link>
        </div>

        <div className="auth-business-link">
          Sei un locale? <Link href="/business/login">Accedi come business</Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="auth-page"><div className="auth-card"><p>Caricamento...</p></div></div>}>
      <LoginContent />
    </Suspense>
  );
}
