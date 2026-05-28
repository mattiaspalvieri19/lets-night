'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('Milano');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('La password deve essere di almeno 6 caratteri');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin + '/auth/callback',
        data: {
          full_name: fullName,
          role: 'user',
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: data.user.id,
        full_name: fullName,
        role: 'user',
        phone: phone || null,
        city,
      });
      if (profileError) console.error('Errore profilo:', profileError);
    }

    router.push('/auth/confirm-sent?email=' + encodeURIComponent(email));
  }

  return (
    <div className="auth-page">
      <Link href="/" className="auth-back">Torna alla home</Link>
      <div className="auth-card">
        <div className="auth-logo">Let&apos;s<span>Night</span></div>
        <h1 className="auth-title">Crea il tuo <em>account</em></h1>
        <p className="auth-sub">Eventi, prenotazioni, offerte esclusive. Tutto in un posto.</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label>Nome completo</label>
            <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Mario Rossi" required />
          </div>

          <div className="auth-field">
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="mario@esempio.it" required />
          </div>

          <div className="auth-field">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Almeno 6 caratteri" required minLength={6} />
          </div>

          <div className="auth-row">
            <div className="auth-field">
              <label>Telefono</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+39 340..." />
            </div>
            <div className="auth-field">
              <label>Citta</label>
              <select value={city} onChange={e => setCity(e.target.value)}>
                <option value="Milano">Milano</option>
                <option value="Roma">Roma</option>
              </select>
            </div>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'Registrazione...' : 'Crea account'}
          </button>
        </form>

        <div className="auth-footer">
          Hai gia un account? <Link href="/login">Accedi</Link>
        </div>

        <div className="auth-business-link">
          Sei un locale? <Link href="/business/register">Registra il tuo business</Link>
        </div>
      </div>
    </div>
  );
}
