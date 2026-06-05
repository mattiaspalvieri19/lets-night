'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import Navbar from '../../../components/Navbar';

export default function DeleteAccountPage() {
  const router = useRouter();
  const [myId, setMyId] = useState(null);
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }
      setMyId(session.user.id);
    }
    load();
  }, [router]);

  async function handleDelete(e) {
    e.preventDefault();
    if (confirm !== 'elimina' || !myId) return;

    setLoading(true);
    setError('');

    try {
      await Promise.all([
        supabase.from('profiles').update({
          full_name: 'Utente eliminato',
          display_name: null,
          username: null,
          bio: null,
          avatar_url: null,
          phone: null,
          interests: [],
          city: null,
          birth_date: null,
        }).eq('id', myId),
        supabase.from('bookings').delete().eq('user_id', myId),
        supabase.from('follows').delete().eq('follower_id', myId),
        supabase.from('follows').delete().eq('following_id', myId),
        supabase.from('favorite_venues').delete().eq('user_id', myId),
      ]);
      await supabase.auth.signOut();
      router.push('/');
    } catch {
      setError('Si è verificato un errore. Riprova o contatta il supporto.');
      setLoading(false);
    }
  }

  const canDelete = confirm === 'elimina';

  return (
    <div className="settings-page">
      <Navbar />
      <div className="settings-container">
        <div style={{ marginBottom: 6 }}>
          <Link href="/settings" style={{ color: 'var(--text2)', fontSize: 13, textDecoration: 'none' }}>
            ← Impostazioni
          </Link>
        </div>
        <h1 className="settings-title" style={{ color: '#F87171' }}>Elimina account</h1>

        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 14, padding: '16px 20px', marginBottom: 28 }}>
          <p style={{ color: '#F87171', fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
            Cosa succede eliminando l&apos;account:
          </p>
          {[
            'Il profilo non sarà più visibile ad altri utenti',
            'Le prenotazioni attive verranno cancellate',
            'I punti fedeltà e i badge verranno rimossi',
            'I follower e i seguiti verranno rimossi',
          ].map((t, i) => (
            <p key={i} style={{ color: '#FCA5A5', fontSize: 13, margin: '0 0 4px' }}>· {t}</p>
          ))}
        </div>

        {error && <div className="auth-error" style={{ marginBottom: 16 }}>{error}</div>}

        <form onSubmit={handleDelete} className="settings-section">
          <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 16 }}>
            Per confermare scrivi <strong style={{ color: '#fff' }}>elimina</strong> nel campo qui sotto:
          </p>
          <div className="auth-field" style={{ marginBottom: 20 }}>
            <input
              type="text"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="elimina"
              autoCapitalize="none"
              style={{ borderColor: canDelete ? 'rgba(239,68,68,0.5)' : undefined }}
            />
          </div>
          <button
            type="submit"
            disabled={!canDelete || loading}
            style={{
              width: '100%', padding: '14px 20px', borderRadius: 10,
              background: canDelete ? '#DC2626' : '#374151',
              color: '#fff', fontWeight: 800, fontSize: 15,
              border: 'none', cursor: canDelete ? 'pointer' : 'not-allowed',
              opacity: !canDelete || loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Eliminazione...' : 'Elimina definitivamente'}
          </button>
          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <Link href="/settings" style={{ color: 'var(--text2)', fontSize: 14 }}>Annulla</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
