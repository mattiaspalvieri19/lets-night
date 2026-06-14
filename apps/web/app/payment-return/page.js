import Link from 'next/link';
import Stripe from 'stripe';
import { fulfillBookingFromSession } from '../../lib/fulfillBooking';
import AppReturnRedirect from './AppReturnRedirect';

// Conferma SERVER-SIDE durante il render: niente fetch lato client, niente deep link,
// niente dipendenza dalla cache del browser in-app (era la causa del "Verifica
// pagamento" eterno in Expo Go). La pagina arriva già con l'esito.
// L'app mobile conferma comunque per conto suo (con token → QR immediato); qui, non
// autenticati, non mostriamo il QR: lo si vede in app, in Biglietti.
export const dynamic = 'force-dynamic';

let _stripe;
function stripe() {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

async function resolvePhase(status, sessionId) {
  if (status !== 'success') return { phase: 'cancelled' };
  if (!sessionId) return { phase: 'error' };

  let session;
  try {
    session = await stripe().checkout.sessions.retrieve(sessionId);
  } catch (e) {
    console.error('Stripe retrieve session (payment-return):', e?.message || e);
    return { phase: 'error' };
  }

  const result = await fulfillBookingFromSession(session);
  if (result.ok) return { phase: 'confirmed' };
  if (result.refunded) return { phase: 'refunded', msg: result.error || '' };
  return { phase: 'error' };
}

export default async function PaymentReturnPage({ searchParams }) {
  const sp = (await searchParams) || {};
  const status = typeof sp.status === 'string' ? sp.status : 'cancel';
  const sessionId = typeof sp.session_id === 'string' ? sp.session_id : '';

  const { phase, msg } = await resolvePhase(status, sessionId);

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0C', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <AppReturnRedirect status={status} sessionId={sessionId} />
      <div style={{ maxWidth: 480, textAlign: 'center', width: '100%' }}>
        {phase === 'cancelled' && (
          <>
            <div style={{ fontSize: 56, marginBottom: 16 }}>✕</div>
            <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 10 }}>Pagamento annullato</h1>
            <p style={{ color: '#A1A1AA', marginBottom: 20 }}>Nessun addebito effettuato. Torna all&apos;app Let&apos;s Night.</p>
            <Link href="/" style={{ display: 'inline-block', background: '#7C3AED', color: '#fff', padding: '12px 24px', borderRadius: 10, textDecoration: 'none' }}>Torna alla home</Link>
          </>
        )}

        {phase === 'confirmed' && (
          <>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
            <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>Pagamento confermato!</h1>
            <p style={{ color: '#A1A1AA', marginBottom: 8, fontSize: 14, lineHeight: 1.5 }}>
              La tua prenotazione è stata registrata.
            </p>
            <p style={{ color: '#A1A1AA', marginBottom: 24, fontSize: 14, lineHeight: 1.5 }}>
              Puoi chiudere questa pagina e tornare all&apos;app <strong style={{ color: '#fff' }}>Let&apos;s Night</strong>: trovi il biglietto col QR nella sezione <strong style={{ color: '#fff' }}>Biglietti</strong>.
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
