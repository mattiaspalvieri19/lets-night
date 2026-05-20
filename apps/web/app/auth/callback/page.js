'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';

export default function CallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState('verifying');

  useEffect(() => {
    async function handleCallback() {
      // Supabase gestisce automaticamente il token dall URL
      const { data, error } = await supabase.auth.getSession();

      if (error || !data.session) {
        setStatus('error');
        return;
      }

      setStatus('success');

      // Controlla il ruolo e reindirizza
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.session.user.id).single();

      setTimeout(() => {
        if (profile?.role === 'business') {
          router.push('/business/dashboard');
        } else {
          router.push('/dashboard');
        }
      }, 1500);
    }
    handleCallback();
  }, [router]);

  return (
    <div className="auth-page">
      <div className="auth-card auth-card-centered">
        <div className="auth-logo">Let&apos;s<span>Night</span></div>
        {status === 'verifying' && (
          <>
            <h1 className="auth-title">Verifica in <em>corso</em></h1>
            <p className="auth-sub">Stiamo attivando il tuo account...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="auth-icon-big auth-icon-success">OK</div>
            <h1 className="auth-title">Account <em>attivato</em></h1>
            <p className="auth-sub">Ti stiamo reindirizzando alla tua area personale.</p>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 className="auth-title">Link <em>non valido</em></h1>
            <p className="auth-sub">Il link potrebbe essere scaduto. Prova a registrarti di nuovo o contattaci.</p>
            <Link href="/login" className="auth-submit auth-submit-link">Vai al login</Link>
          </>
        )}
      </div>
    </div>
  );
}
