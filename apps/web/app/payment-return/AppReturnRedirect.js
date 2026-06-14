'use client';

import { useEffect } from 'react';

// Riporta automaticamente nell'app mobile. Dentro WebBrowser.openAuthSessionAsync, iOS
// INTERCETTA la navigazione verso lo scheme dell'app (letsnight:// nelle build, exp://...
// non serve qui perché basta che lo scheme combaci col returnUrl dato all'auth session) e
// chiude il browser riportando nell'app — NON apre davvero il deep link, quindi niente loop.
// In un browser normale (utente web) lo scheme non risolve e resta il messaggio renderizzato
// dal server. La conferma del pagamento è già avvenuta lato server: questo è solo per l'UX di
// rientro. Guard in sessionStorage → al massimo un tentativo per sessione, mai un loop.
export default function AppReturnRedirect({ status, sessionId }) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = 'ln_return_' + (sessionId || status || 'x');
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {}
    const qs = `status=${encodeURIComponent(status || 'success')}${sessionId ? `&session_id=${encodeURIComponent(sessionId)}` : ''}`;
    window.location.href = `letsnight://payment-return?${qs}`;
  }, [status, sessionId]);

  return null;
}
