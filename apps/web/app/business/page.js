'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import Navbar from '../../components/Navbar';

export default function BusinessLanding() {
  const cursorRef = useRef(null);
  const innerRef = useRef(null);

  useEffect(() => {
    const dot = cursorRef.current;
    const ring = innerRef.current;
    if (!dot || !ring) return;
    let mx=0, my=0, cx=0, cy=0, raf;
    const onMove = e => { mx=e.clientX; my=e.clientY; };
    window.addEventListener('mousemove', onMove);
    const tick = () => {
      cx += (mx-cx)*.14; cy += (my-cy)*.14;
      dot.style.transform = 'translate('+(mx-4)+'px,'+(my-4)+'px)';
      ring.style.transform = 'translate('+(cx-20)+'px,'+(cy-20)+'px)';
      raf = requestAnimationFrame(tick);
    };
    tick();
    const over = e => { if (e.target.closest('a,button,input')) ring.classList.add('expand'); };
    const out = () => ring.classList.remove('expand');
    document.addEventListener('mouseover', over);
    document.addEventListener('mouseout', out);
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseover', over);
      document.removeEventListener('mouseout', out);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      <div className="cur-dot" ref={cursorRef} />
      <div className="cur-ring" ref={innerRef} />

      <Navbar />

      <div className="biz-hero">
        <div className="biz-hero-bg" />
        <div className="biz-hero-content">
          <div className="biz-badge">Per i locali</div>
          <h1 className="biz-title">Riempi il tuo<br /><em>locale ogni sera</em></h1>
          <p className="biz-sub">Pubblica i tuoi eventi, ricevi prenotazioni automatiche e fai crescere il tuo business. Senza costi di attivazione.</p>
          <div className="biz-cta">
            <Link href="/business/register" className="biz-btn-primary big">Registra il tuo locale</Link>
            <Link href="#come-funziona" className="ln-btn-outline">Come funziona</Link>
          </div>
        </div>
      </div>

      <div className="biz-stats">
        <div className="stat"><span className="sn sn-gold">12k+</span><span className="sl">utenti attivi al mese</span></div>
        <div className="stat-div" />
        <div className="stat"><span className="sn sn-gold">EUR 0</span><span className="sl">costo attivazione</span></div>
        <div className="stat-div" />
        <div className="stat"><span className="sn sn-gold">2%</span><span className="sl">fee sulle prenotazioni</span></div>
        <div className="stat-div" />
        <div className="stat"><span className="sn sn-gold">24/7</span><span className="sl">supporto</span></div>
      </div>

      <section className="biz-benefits" id="come-funziona">
        <div className="sec-head">
          <div className="sec-label biz-label">Perche Let&apos;s Night</div>
          <h2 className="sec-title">Tutto cio che ti serve in <em>un solo posto</em></h2>
        </div>
        <div className="biz-grid">
          {[
            { t:'Visibilita immediata', d:'Appari subito agli utenti di Milano che cercano eventi stasera. Algoritmo di scoperta intelligente.' },
            { t:'Prenotazioni automatiche', d:'I clienti prenotano direttamente dall app. Tu ricevi conferma istantanea via email e vedi tutto in dashboard.' },
            { t:'Dashboard completa', d:'Statistiche in tempo reale, gestione eventi, modifica prezzi e capienza. Controllo totale sul tuo locale.' },
            { t:'Sponsorizzazioni', d:'Vuoi massima visibilita? Attiva il badge sponsorizzato e appari in cima ai risultati nella tua categoria.' },
            { t:'Zero rischi', d:'Nessun costo fisso, nessun abbonamento. Paghi solo una piccola fee sulle prenotazioni effettive che ricevi.' },
            { t:'Cassa automatica', d:'Gli incassi arrivano direttamente sul tuo conto. Report fiscale generato automaticamente a fine mese.' },
          ].map((b,i) => (
            <div key={i} className="biz-card">
              <div className="biz-num">{String(i+1).padStart(2,'0')}</div>
              <h3>{b.t}</h3>
              <p>{b.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="biz-how">
        <div className="sec-head">
          <div className="sec-label biz-label">Iniziare e facile</div>
          <h2 className="sec-title">3 passi per <em>partire</em></h2>
        </div>
        <div className="how-grid">
          {[
            { n:'01', t:'Registra il locale', d:'Compila il modulo con i dati del tuo locale. Riceviamo la tua richiesta e verifichiamo i dati entro 24 ore.' },
            { n:'02', t:'Ricevi approvazione', d:'Ti scriviamo noi via email appena il tuo locale e verificato e attivo sulla piattaforma. Nessun costo.' },
            { n:'03', t:'Pubblica eventi', d:'Accedi alla dashboard e pubblica il tuo primo evento. Gli utenti lo vedranno in tempo reale sulla homepage.' },
          ].map((s,i) => (
            <div key={s.n} className="how-card biz-how-card">
              <div className="how-num biz-how-num">{s.n}</div>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="cta-final biz-cta-final">
        <div className="cta-inner">
          <h2>Pronto a far crescere<br /><em>il tuo locale?</em></h2>
          <p>Registrati ora. La nostra squadra ti contatta entro 24 ore per attivare il tuo account.</p>
          <Link href="/business/register" className="biz-btn-primary big">Registra il tuo locale</Link>
        </div>
      </div>

      <footer className="ln-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <div className="ln-logo-sm">Let&apos;s<span>Night</span></div>
            <p>Business Portal</p>
          </div>
          <div className="footer-links">
            <div className="fcol">
              <div className="fcol-label">Business</div>
              <Link href="/business/register">Registra locale</Link>
              <Link href="/business/login">Accedi</Link>
              <Link href="/">Torna al sito utenti</Link>
            </div>
          </div>
        </div>
        <div className="footer-base">&copy; 2026 Let&apos;s Night - Business Portal</div>
      </footer>
    </>
  );
}
