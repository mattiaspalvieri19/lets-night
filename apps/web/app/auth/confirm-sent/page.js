'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function ConfirmSentContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || 'la tua email';
  const isBusiness = searchParams.get('type') === 'business';

  return (
    <div className="auth-page">
      <Link href="/" className="auth-back">Torna alla home</Link>
      <div className="auth-card auth-card-centered">
        <div className="auth-logo">Let&apos;s<span>Night</span>{isBusiness && <span className="biz-tag"> Business</span>}</div>
        <div className="auth-icon-big">✓</div>
        <h1 className="auth-title">
          {isBusiness ? <>Richiesta <em>inviata</em></> : <>Controlla la <em>tua email</em></>}
        </h1>
        {isBusiness ? (
          <>
            <p className="auth-sub">
              Abbiamo ricevuto la tua richiesta per <strong style={{ color: '#fff' }}>{email}</strong>
            </p>
            <p className="auth-sub" style={{ marginTop: '1rem', fontSize: '13px' }}>
              Controlla prima la tua email e clicca il link di conferma.<br />
              Dopodiché il team Let&apos;s Night verificherà il tuo locale entro <strong style={{ color: '#fff' }}>24–48 ore</strong> e riceverai una conferma di attivazione.
            </p>
            <Link href="/business/login" className="auth-submit auth-submit-link">Vai al login business</Link>
          </>
        ) : (
          <>
            <p className="auth-sub">
              Ti abbiamo inviato un link di conferma a<br />
              <strong style={{ color: '#fff' }}>{email}</strong>
            </p>
            <p className="auth-sub" style={{ marginTop: '1.5rem', fontSize: '13px' }}>
              Clicca il link nella email per attivare il tuo account. Se non vedi l email, controlla la cartella spam.
            </p>
            <Link href="/login" className="auth-submit auth-submit-link">Torna al login</Link>
          </>
        )}
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
