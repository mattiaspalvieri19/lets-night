'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import QRCode from 'react-qr-code';
import { useSearchParams } from 'next/navigation';

function PaymentReturnInner() {
  const params = useSearchParams();
  const status = params.get('status') || 'cancel';
  const sessionId = params.get('session_id') || '';
  const isSuccess = status === 'success';

  const [qr, setQr] = useState(null);
  const [phase, setPhase] = useState(isSuccess ? 'verifying' : 'cancelled'); // verifying|qr|confirmed|refunded|error|cancelled
  const [msg, setMsg] = useState('');

  useEffect(() => {
    // Tentativo deep link verso l'app: funziona nelle dev/prod build (scheme letsnight://).
    // In Expo Go non fa nulla → restiamo sulla pagina e confermiamo lato server qui sotto.
    if (typeof window !== 'undefined') {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile && (isSuccess || status === 'cancel')) {
        const deep = `letsnight://payment-return?status=${encodeURIComponent(status)}${sessionId ? `&session_id=${encodeURIComponent(sessionId)}` : ''}`;
        window.location.href = deep;
      }
    }

    if (!isSuccess || !sessionId) return;

    let cancelled = false;
    (async () => {
      try {
        // La pagina (in-app browser) NON è loggata: confermiamo con il solo sessionId.
        // Il server fulfilla via metadata della session Stripe (idempotente) e — senza
        // token — NON restituisce il QR: lo si vede nell'app, in Biglietti.
        const res = await fetch('/api/stripe/confirm-booking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          if (json.refunded) { setMsg(json.error || ''); setPhase('refunded'); }
          else setPhase('error');
          return;
        }
        if (json.qrCode) { setQr(json.qrCode); setPhase('qr'); }
        else setPhase('confirmed');
      } catch {
        if (!cancelled) setPhase('error');
      }
    })();
    return () => { cancelled = true; };
  }, [isSuccess, sessionId, status]);

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0C', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 480, textAlign: 'center', width: '100%' }}>
        {phase === 'cancelled' && (
          <>
            <div style={{ fontSize: 56, marginBottom: 16 }}>✕</div>
            <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 10 }}>Pagamento annullato</h1>
            <p style={{ color: '#A1A1AA', marginBottom: 20 }}>Nessun addebito effettuato. Torna all&apos;app Let&apos;s Night.</p>
            <Link href="/" style={{ display: 'inline-block', background: '#7C3AED', color: '#fff', padding: '12px 24px', borderRadius: 10, textDecoration: 'none' }}>Torna alla home</Link>
          </>
        )}

        {phase === 'verifying' && (
          <>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Verifica pagamento...</h1>
            <p style={{ color: '#A1A1AA', fontSize: 14 }}>Stiamo confermando la tua prenotazione.</p>
          </>
        )}

        {phase === 'qr' && (
          <>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
            <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Prenotato!</h1>
            <p style={{ color: '#A1A1AA', marginBottom: 18, fontSize: 14 }}>Mostra questo QR all&apos;ingresso del locale.</p>
            <div style={{ background: '#fff', padding: 16, borderRadius: 12, display: 'inline-block', marginBottom: 18 }}>
              <QRCode value={qr} size={220} />
            </div>
            <p style={{ color: '#71717A', fontSize: 12, marginBottom: 18 }}>
              Lo ritrovi sempre nella tua area personale.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/dashboard" style={{ background: '#7C3AED', color: '#fff', padding: '12px 24px', borderRadius: 10, textDecoration: 'none', fontWeight: 600 }}>I miei biglietti</Link>
              <Link href="/" style={{ background: 'transparent', color: '#A855F7', padding: '12px 24px', borderRadius: 10, textDecoration: 'none', border: '1px solid rgba(168,85,247,0.35)', fontWeight: 600 }}>Home</Link>
            </div>
          </>
        )}

        {phase === 'confirmed' && (
          <>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
            <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>Prenotazione confermata!</h1>
            <p style={{ color: '#A1A1AA', marginBottom: 8, fontSize: 14, lineHeight: 1.5 }}>
              Il pagamento è andato a buon fine.
            </p>
            <p style={{ color: '#A1A1AA', marginBottom: 24, fontSize: 14, lineHeight: 1.5 }}>
              Chiudi questa pagina e apri l&apos;app <strong style={{ color: '#fff' }}>Let&apos;s Night</strong>: trovi il biglietto col QR nella sezione <strong style={{ color: '#fff' }}>Biglietti</strong>.
            </p>
            <Link href="/" style={{ background: '#7C3AED', color: '#fff', padding: '12px 24px', borderRadius: 10, textDecoration: 'none', fontWeight: 600 }}>Torna alla home</Link>
          </>
        )}

        {phase === 'refunded' && (
          <>
            <div style={{ fontSize: 48, marginBottom: 12 }}>💸</div>
            <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>Rimborso automatico</h1>
            <p style={{ color: '#A1A1AA', marginBottom: 16, fontSize: 14, lineHeight: 1.5 }}>
              {msg || 'Non è stato possibile completare la prenotazione: il rimborso è già stato avviato e lo vedrai sulla carta entro 5-10 giorni lavorativi.'}
            </p>
            <p style={{ color: '#71717A', fontSize: 12, marginBottom: 24 }}>
              Nessuna azione richiesta. Per dubbi scrivi a <a href="mailto:support@letsnight.it" style={{ color: '#A855F7' }}>support@letsnight.it</a>.
            </p>
            <Link href="/" style={{ background: '#7C3AED', color: '#fff', padding: '12px 24px', borderRadius: 10, textDecoration: 'none', fontWeight: 600 }}>Torna alla home</Link>
          </>
        )}

        {phase === 'error' && (
          <>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
            <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Verifica in corso</h1>
            <p style={{ color: '#A1A1AA', marginBottom: 18, fontSize: 14 }}>
              Se hai effettuato il pagamento, la prenotazione apparirà nell&apos;app entro pochi secondi, in Biglietti.
              Se non la vedi entro 1-2 minuti, contattaci.
            </p>
            <Link href="/" style={{ background: '#7C3AED', color: '#fff', padding: '12px 24px', borderRadius: 10, textDecoration: 'none', fontWeight: 600 }}>Torna alla home</Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function PaymentReturnPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0A0A0C' }} />}>
      <PaymentReturnInner />
    </Suspense>
  );
}
