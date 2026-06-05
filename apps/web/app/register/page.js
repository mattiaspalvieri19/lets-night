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
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState('');
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
    if (!birthDate) {
      setError('Inserisci la tua data di nascita');
      return;
    }

    setLoading(true);

    // Pre-check telefono via RPC (bypassa RLS profiles per utente non autenticato)
    if (phone) {
      const { data: available, error: rpcErr } = await supabase.rpc('check_phone_available', { p_phone: phone });
      if (rpcErr || available == null) {
        setError('Verifica telefono non riuscita. Riprova.');
        setLoading(false);
        return;
      }
      if (available === false) {
        setError('Questo numero di telefono è già associato a un account.');
        setLoading(false);
        return;
      }
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin + '/auth/callback',
        data: {
          full_name: fullName,
          role: 'user',
          phone: phone || null,
          city,
          birth_date: birthDate,
          gender: gender || null,
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    if (data?.user && (!data.user.identities || data.user.identities.length === 0)) {
      setError('Questa email è già registrata. Accedi oppure usa un\'altra email.');
      setLoading(false);
      return;
    }

    // Profilo + venue gestiti dal trigger SQL handle_new_user
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
              <label>Data di nascita</label>
              <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} required max={new Date().toISOString().split('T')[0]} />
            </div>
          </div>

          <div className="auth-row">
            <div className="auth-field">
              <label>Sesso</label>
              <select value={gender} onChange={e => setGender(e.target.value)}>
                <option value="">Preferisco non dirlo</option>
                <option value="M">Uomo</option>
                <option value="F">Donna</option>
                <option value="X">Altro</option>
              </select>
            </div>
            <div className="auth-field">
              <label>Città</label>
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
