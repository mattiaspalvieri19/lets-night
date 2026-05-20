'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function ConfirmSentContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || 'la tua email';

  return (
    <div className="auth-page">
      <Link href="/" className="auth-back">Torna alla home</Link>
      <div className="auth-card auth-card-centered">
        <div className="auth-logo">Let&apos;s<span>Night</span></div>
        <div className="auth-icon-big">EMAIL</div>
        <h1 className="auth-title">Controlla la <em>tua email</em></h1>
        <p className="auth-sub">
          Ti abbiamo inviato un link di conferma a<br />
          <strong style={{ color: '#fff' }}>{email}</strong>
        </p>
        <p className="auth-sub" style={{ marginTop: '1.5rem', fontSize: '13px' }}>
          Clicca il link nella email per attivare il tuo account. Se non vedi l email, controlla la cartella spam.
        </p>
        <Link href="/login" className="auth-submit auth-submit-link">Torna al login</Link>
      </div>
    </div>
  );
}

export default function ConfirmSentPage() {
  return (
    <Suspense fallback={<div className="auth-page"><div className="auth-card"><p>Caricamento...</p></div></div>}>
      <ConfirmSentContent />
    </Suspense>
  );
}
