'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';

export default function CallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState('verifying');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function handleCallback() {
      const params = new URLSearchParams(window.location.search);

      const urlError = params.get('error');
      if (urlError) {
        const desc = params.get('error_description')?.replace(/\+/g, ' ');
        setErrorMsg(desc || 'Link non valido o scaduto.');
        setStatus('error');
        return;
      }

      const code = params.get('code');
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          setErrorMsg('Impossibile attivare l\'account. Il link potrebbe essere scaduto.');
          setStatus('error');
          return;
        }
      }

      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session) {
        setErrorMsg('Sessione non trovata. Prova a registrarti di nuovo.');
        setStatus('error');
        return;
      }

      setStatus('success');

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.session.user.id)
        .single();

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
            <p className="auth-sub">{errorMsg || 'Il link potrebbe essere scaduto. Prova a registrarti di nuovo o contattaci.'}</p>
            <Link href="/register" className="auth-submit auth-submit-link" style={{ marginBottom: '12px' }}>Registrati di nuovo</Link>
            <Link href="/login" style={{ color: 'var(--brand)', fontSize: '14px' }}>Vai al login</Link>
          </>
        )}
      </div>
    </div>
  );
}
