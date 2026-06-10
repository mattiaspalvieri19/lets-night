'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import QRCode from 'react-qr-code';
import { useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabase';

function PaymentReturnInner() {
  const params = useSearchParams();
  const status = params.get('status') || 'cancel';
  const sessionId = params.get('session_id') || '';
  const isSuccess = status === 'success';

  const [qr, setQr] = useState(null);
  const [phase, setPhase] = useState(isSuccess ? 'verifying' : 'cancelled'); // verifying|qr|error|cancelled|refunded
  const [refundedReason, setRefundedReason] = useState(null); // oversold|price_changed|duplicate

  useEffect(() => {
    // Tentativo deep link mobile (no-op su desktop).
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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (!cancelled) setPhase('error');
        return;
      }
      try {
        const res = await fetch('/api/stripe/confirm-booking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, accessToken: session.access_token }),
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.qrCode) {
          if (json.refunded) {
            if (json.duplicate) setRefundedReason('duplicate');
            else if (json.oversold) setRefundedReason('oversold');
            else setRefundedReason('price_changed');
            setPhase('refunded');
            return;
          }
          setPhase('error');
          return;
        }
        setQr(json.qrCode);
        setPhase('qr');
      } catch {
        if (!cancelled) setPhase('error');
      }
    })();
    return () => { cancelled = true; };
  }, [isSuccess, sessionId, status]);

  return (
    <div style={{ minHeight: '100vh', background: '#09090f', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 480, textAlign: 'center', width: '100%' }}>
        {phase === 'cancelled' && (
          <>
            <div style={{ fontSize: 56, marginBottom: 16 }}>✕</div>
            <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 10 }}>Pagamento annullato</h1>
            <p style={{ color: '#94a3b8', marginBottom: 20 }}>Nessun addebito effettuato.</p>
            <Link href="/" style={{ display: 'inline-block', background: '#7C3AED', color: '#fff', padding: '12px 24px', borderRadius: 10, textDecoration: 'none' }}>Torna alla home</Link>
          </>
        )}

        {phase === 'verifying' && (
          <>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Verifica pagamento...</h1>
            <p style={{ color: '#94a3b8', fontSize: 14 }}>Stiamo confermando la tua prenotazione.</p>
          </>
        )}

        {phase === 'qr' && (
          <>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
            <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Prenotato!</h1>
            <p style={{ color: '#94a3b8', marginBottom: 18, fontSize: 14 }}>Mostra questo QR all&apos;ingresso del locale.</p>
            <div style={{ background: '#fff', padding: 16, borderRadius: 12, display: 'inline-block', marginBottom: 18 }}>
              <QRCode value={qr} size={220} />
            </div>
            <p style={{ color: '#64748B', fontSize: 12, marginBottom: 18 }}>
              Lo ritrovi sempre nella tua area personale.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/dashboard" style={{ background: '#7C3AED', color: '#fff', padding: '12px 24px', borderRadius: 10, textDecoration: 'none', fontWeight: 600 }}>I miei biglietti</Link>
              <Link href="/" style={{ background: 'transparent', color: '#A855F7', padding: '12px 24px', borderRadius: 10, textDecoration: 'none', border: '1px solid rgba(168,85,247,0.35)', fontWeight: 600 }}>Home</Link>
            </div>
          </>
        )}

        {phase === 'refunded' && (
          <>
            <div style={{ fontSize: 48, marginBottom: 12 }}>💸</div>
            <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>Rimborso automatico</h1>
            <p style={{ color: '#94a3b8', marginBottom: 16, fontSize: 14, lineHeight: 1.5 }}>
              {refundedReason === 'duplicate'
                ? 'Avevi già una prenotazione attiva per questo evento. Il rimborso è già stato avviato e lo vedrai sulla tua carta entro 5-10 giorni lavorativi.'
                : refundedReason === 'oversold'
                ? 'Posti esauriti dopo il tuo pagamento. Il rimborso è già stato avviato e lo vedrai sulla tua carta entro 5-10 giorni lavorativi.'
                : 'Il prezzo dell\'evento è cambiato dopo il pagamento. Il rimborso è già stato avviato e lo vedrai sulla tua carta entro 5-10 giorni lavorativi.'}
            </p>
            <p style={{ color: '#64748B', fontSize: 12, marginBottom: 24 }}>
              Nessuna azione richiesta da parte tua. Per qualsiasi dubbio scrivi a <a href="mailto:support@letsnight.it" style={{ color: '#A855F7' }}>support@letsnight.it</a>.
            </p>
            <Link href="/" style={{ background: '#7C3AED', color: '#fff', padding: '12px 24px', borderRadius: 10, textDecoration: 'none', fontWeight: 600 }}>Torna alla home</Link>
          </>
        )}

        {phase === 'error' && (
          <>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
            <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Verifica in corso</h1>
            <p style={{ color: '#94a3b8', marginBottom: 18, fontSize: 14 }}>
              Se hai effettuato il pagamento, la prenotazione apparirà in pochi secondi nei tuoi biglietti.
              Se non la vedi entro 1-2 minuti, contattaci.
            </p>
            <Link href="/dashboard" style={{ background: '#7C3AED', color: '#fff', padding: '12px 24px', borderRadius: 10, textDecoration: 'none', fontWeight: 600 }}>I miei biglietti</Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function PaymentReturnPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#09090f' }} />}>
      <PaymentReturnInner />
    </Suspense>
  );
}
