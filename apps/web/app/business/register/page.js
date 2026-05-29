'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { CATS_NO_TUTTI } from '@lets-night/shared';

export default function BusinessRegister() {
  const router = useRouter();
  const [form, setForm] = useState({
    venueName: '',
    category: 'Discoteca',
    city: 'Milano',
    zona: '',
    address: '',
    phone: '',
    description: '',
    ownerName: '',
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (form.password.length < 6) {
      setError('La password deve essere di almeno 6 caratteri');
      return;
    }

    setLoading(true);

    const { error: authError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        emailRedirectTo: window.location.origin + '/auth/callback',
        data: {
          full_name: form.ownerName,
          role: 'business',
          phone: form.phone,
          city: form.city,
          venue_name: form.venueName,
          venue_category: form.category,
          venue_city: form.city,
          venue_zona: form.zona,
          venue_address: form.address,
          venue_phone: form.phone,
          venue_description: form.description,
        },
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    router.push('/auth/confirm-sent?email=' + encodeURIComponent(form.email) + '&type=business');
  }

  return (
    <div className="auth-page biz-auth-page">
      <Link href="/business" className="auth-back">Torna al business portal</Link>
      <div className="auth-card biz-auth-card">
        <div className="auth-logo">Let&apos;s<span>Night</span> <span className="biz-tag">Business</span></div>
        <h1 className="auth-title">Registra il <em>tuo locale</em></h1>
        <p className="auth-sub">Compila i dati qui sotto. Ti contatteremo entro 24 ore per attivare il tuo account.</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-section-label">Dati del locale</div>
          
          <div className="auth-field">
            <label>Nome del locale</label>
            <input type="text" value={form.venueName} onChange={handleChange('venueName')} placeholder="Es. Amnesia Club" required />
          </div>

          <div className="auth-row">
            <div className="auth-field">
              <label>Categoria</label>
              <select value={form.category} onChange={handleChange('category')}>
                {CATS_NO_TUTTI.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="auth-field">
              <label>Citta</label>
              <select value={form.city} onChange={handleChange('city')}>
                <option value="Milano">Milano</option>
                <option value="Roma">Roma</option>
              </select>
            </div>
          </div>

          <div className="auth-field">
            <label>Zona</label>
            <input type="text" value={form.zona} onChange={handleChange('zona')} placeholder="Es. Navigli, Trastevere..." required />
          </div>

          <div className="auth-field">
            <label>Indirizzo</label>
            <input type="text" value={form.address} onChange={handleChange('address')} placeholder="Via, numero civico" />
          </div>

          <div className="auth-field">
            <label>Telefono locale</label>
            <input type="tel" value={form.phone} onChange={handleChange('phone')} placeholder="+39 02..." required />
          </div>

          <div className="auth-field">
            <label>Descrizione breve</label>
            <textarea value={form.description} onChange={handleChange('description')} placeholder="Cosa rende speciale il tuo locale?" rows={3} />
          </div>

          <div className="auth-section-label" style={{ marginTop: '1.5rem' }}>Account di accesso</div>

          <div className="auth-field">
            <label>Nome e cognome titolare</label>
            <input type="text" value={form.ownerName} onChange={handleChange('ownerName')} placeholder="Mario Rossi" required />
          </div>

          <div className="auth-field">
            <label>Email</label>
            <input type="email" value={form.email} onChange={handleChange('email')} placeholder="info@tuolocale.it" required />
          </div>

          <div className="auth-field">
            <label>Password</label>
            <input type="password" value={form.password} onChange={handleChange('password')} placeholder="Almeno 6 caratteri" required minLength={6} />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="biz-submit" disabled={loading}>
            {loading ? 'Registrazione...' : 'Invia richiesta'}
          </button>

          <p className="auth-disclaimer">
            La tua richiesta verra verificata manualmente entro 24 ore. Riceverai una email di conferma all approvazione.
          </p>
        </form>

        <div className="auth-footer">
          Hai gia un account? <Link href="/business/login">Accedi</Link>
        </div>
      </div>
    </div>
  );
}
