'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { CATS, COLORS_BY_CAT, formatDate, formatTime, getPriceLabel } from '@lets-night/shared';

export default function Home() {
  const scrollerRef = useRef(null);
  const [city, setCity] = useState('Milano');
  const [cat, setCat] = useState('Tutti');
  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [walletEmail, setWalletEmail] = useState('');
  const [walletSubmitted, setWalletSubmitted] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);


  useEffect(() => {
    async function loadEvents() {
      setLoading(true);
      const { data, error } = await supabase
        .from('events')
        .select('*, venues(name, zona, city, is_partner)')
        .eq('is_active', true)
        .order('event_date', { ascending: true });
      if (error) console.error('Errore caricamento eventi:', error);
      else setEvents(data || []);
      setLoading(false);
    }
    loadEvents();
  }, []);
  useEffect(() => {
    const obs = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) e.target.classList.add('in');
      else e.target.classList.remove('in');
    }), { threshold:.1, rootMargin:'-8% 0px -8% 0px' });
    document.querySelectorAll('[data-anim]').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [events, loading]);

  useEffect(() => {
    function onScroll() {
      const nav = document.getElementById('lnav');
      if (nav) nav.classList.toggle('solid', window.scrollY > 60);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function scrollCarousel(dir) {
    const el = scrollerRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.8;
    el.scrollBy({ left: dir * amount, behavior: 'smooth' });
  }

  const filtered = events.filter(e => {
    if (e.venues?.city !== city) return false;
    if (cat !== 'Tutti' && e.category !== cat) return false;
    if (search && !e.title.toLowerCase().includes(search.toLowerCase()) && !(e.venues?.name || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const scoreA = (a.is_sponsored ? 100 : 0) + ((a.source === 'partner' || a.source === 'manual') ? 50 : 0);
    const scoreB = (b.is_sponsored ? 100 : 0) + ((b.source === 'partner' || b.source === 'manual') ? 50 : 0);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return new Date(a.event_date) - new Date(b.event_date);
  });


  async function handleWalletWaitlist(e) {
    e.preventDefault();
    if (!walletEmail || walletLoading) return;
    setWalletLoading(true);
    const { error } = await supabase
      .from('wallet_waitlist')
      .insert({ email: walletEmail, city: city, source: 'homepage_teaser' });
    setWalletLoading(false);
    if (!error || error.code === '23505') {
      setWalletSubmitted(true);
      setWalletEmail('');
    } else {
      alert('Errore: riprova tra poco');
      console.error(error);
    }
  }

  return (
    <>
      <nav className="lnav" id="lnav">
        <Link href="/" className="ln-logo">Let&apos;s<span>Night</span></Link>
        <div className={'ln-menu ' + (menuOpen ? 'open' : '')}>
          <Link href="/explore" onClick={() => setMenuOpen(false)}>Esplora</Link>
          <Link href="/business" onClick={() => setMenuOpen(false)}>Per i Locali</Link>
          <button className="ln-city-pill" onClick={() => { setCity(c => c === 'Milano' ? 'Roma' : 'Milano'); setMenuOpen(false); }}>
            {city}
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <Link href="/login" className="ln-btn-ghost" onClick={() => setMenuOpen(false)}>Accedi</Link>
          <Link href="/register" className="ln-btn-primary" onClick={() => setMenuOpen(false)}>Iscriviti</Link>
        </div>
        <button className="ln-burger" onClick={() => setMenuOpen(!menuOpen)}>
          <span /><span /><span />
        </button>
      </nav>

      <div className="hero">
        <div className="hero-bg" />
        <div className="hero-content">
          <div className="hero-badge" data-anim="up">Milano - Roma</div>
          <h1 className="hero-title" data-anim="up">Cosa fai<br /><em>stasera?!</em></h1>
          <p className="hero-sub" data-anim="up" data-delay="200">
            Discoteche, feste universitarie, cene show e molto altro.<br />
            Prenota il tuo posto in pochi secondi.
          </p>
          <div className="hero-search-wrap" data-anim="up" data-delay="400">
            <div className="city-toggle">
              {['Milano','Roma'].map(c => (
                <button key={c} className={city===c ? 'active' : ''} onClick={() => setCity(c)}>{c}</button>
              ))}
            </div>
            <div className="hero-search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input placeholder="Cerca locale, evento, zona..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="hero-scroll">
          <div className="scroll-line" />
          <span>Scorri</span>
        </div>
      </div>

      <div className="stats-strip" data-anim="up">
        <div className="stat"><span className="sn">{events.length}+</span><span className="sl">eventi attivi</span></div>
        <div className="stat-div" />
        <div className="stat"><span className="sn">80+</span><span className="sl">locali partner</span></div>
        <div className="stat-div" />
        <div className="stat"><span className="sn">2</span><span className="sl">citta</span></div>
        <div className="stat-div" />
        <div className="stat"><span className="sn">12k+</span><span className="sl">utenti attivi</span></div>
      </div>

      <section className="events-section">
        <div className="sec-head" data-anim="right">
          <div className="sec-label">Stasera a {city}</div>
          <h2 className="sec-title">Trova il tuo <em>momento</em></h2>
        </div>
        <div className="cat-filters" data-anim="up" data-delay="100">
          {CATS.map(c => (
            <button key={c} className={'cat-btn '+(cat===c?'active':'')} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>

        {loading && <div className="loading-state"><p>Caricamento eventi...</p></div>}

        {!loading && sorted.length > 0 && (
          <div className="carousel-wrap" data-anim="up">
            <button className="carousel-arrow carousel-arrow-left" onClick={() => scrollCarousel(-1)} aria-label="Scorri a sinistra">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>
            <button className="carousel-arrow carousel-arrow-right" onClick={() => scrollCarousel(1)} aria-label="Scorri a destra">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>
            <div className="ev-scroller" ref={scrollerRef}>
              {sorted.map((ev, i) => {
                const catClass = 'cat-' + ev.category.toLowerCase().replace(/ /g,'-');
                const colors = COLORS_BY_CAT[ev.category] || ['#1a0533','#0d0d1a'];
                const priceLabel = getPriceLabel(ev.price);
                return (
                  <Link key={ev.id} href={'/event/' + ev.id} className="ev-card">
                    <div className="ev-visual" style={{ background:'linear-gradient(135deg,' + colors[0] + ',' + colors[1] + ')' }}>
                      <div className="ev-top">
                        <span className={'ev-cat ' + catClass}>{ev.category}</span>
                        {ev.is_sponsored && <span className="ev-sp-tag">★ SPONSOR</span>}
                      </div>
                      <div className="ev-spheres">
                        {[0,1,2,3,4,5].map(j => <div key={j} className="ev-sphere" style={{ animationDelay:(j*.2)+'s' }} />)}
                      </div>
                    </div>
                    <div className="ev-body">
                      <div className="ev-venue">{ev.venues?.name || 'Locale'}</div>
                      <h3 className="ev-title">{ev.title}</h3>
                      <div className="ev-date">{formatDate(ev.event_date)} - {formatTime(ev.event_time)}</div>
                      <div className="ev-zona">{ev.venues?.zona}, {ev.venues?.city}</div>
                    </div>
                    <div className="ev-footer">
                      <span className={'ev-price' + (ev.price > 0 ? ' ev-price-paid' : '')}>{priceLabel}</span>
                      <span className="ev-cta">Prenota &rarr;</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {!loading && sorted.length === 0 && (
          <div className="empty-state" data-anim="up">
            <p>Nessun evento trovato per questa selezione.<br />Prova a cambiare filtro o citta.</p>
          </div>
        )}

        <div className="see-more-wrap" data-anim="up">
          <Link href="/explore" className="ln-btn-outline">Vedi tutti gli eventi</Link>
        </div>
      </section>

      <section className="how-section">
        <div className="sec-head" data-anim="right">
          <div className="sec-label">Come funziona</div>
          <h2 className="sec-title">Tre passi per la<br /><em>tua serata</em></h2>
        </div>
        <div className="how-grid">
          {[
            { n:'01', t:'Scopri', d:'Esplora gli eventi filtrati per categoria, zona e fascia di prezzo. Sempre aggiornati.' },
            { n:'02', t:'Prenota', d:'Acquista il biglietto o prenota il tavolo in pochi secondi. Conferma immediata via email.' },
            { n:'03', t:'Divertiti', d:'Mostra il QR code all ingresso e goditi la serata. Semplice, sicuro, veloce.' },
          ].map((s,i) => (
            <div key={s.n} className="how-card" data-anim="up" data-delay={String(i*120)}>
              <div className="how-num">{s.n}</div>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </div>
          ))}
        </div>
      </section>


      <section className="wallet-teaser" data-anim="up">
        <div className="wt-glow" />
        <div className="wt-inner">
          <div className="wt-badge">
            <span className="wt-badge-dot" />
            COMING SOON
          </div>
          <div className="wt-label">Prossimamente</div>
          <h2 className="wt-title">
            Il tuo <em>wallet</em><br />Let&apos;s Night
          </h2>
          <p className="wt-sub">
            Carica credito una volta, paga ovunque. Salta la fila al bar, 
            prenota al volo, accumula cashback.
          </p>

          <div className="wt-benefits">
            <div className="wt-benefit">
              <div className="wt-benefit-icon">⚡</div>
              <div className="wt-benefit-text">
                <strong>Zero code al bar</strong>
                <span>Scansiona il QR e paga in 2 secondi</span>
              </div>
            </div>
            <div className="wt-benefit">
              <div className="wt-benefit-icon">🎁</div>
              <div className="wt-benefit-text">
                <strong>Cashback fino all&apos;8%</strong>
                <span>Piu carichi, piu guadagni</span>
              </div>
            </div>
            <div className="wt-benefit">
              <div className="wt-benefit-icon">👑</div>
              <div className="wt-benefit-text">
                <strong>Priority lane</strong>
                <span>Accesso prioritario ai locali partner</span>
              </div>
            </div>
          </div>

          {!walletSubmitted ? (
            <form className="wt-form" onSubmit={handleWalletWaitlist}>
              <input
                type="email"
                required
                placeholder="La tua email"
                value={walletEmail}
                onChange={e => setWalletEmail(e.target.value)}
                disabled={walletLoading}
              />
              <button type="submit" disabled={walletLoading}>
                {walletLoading ? 'Attendi...' : 'Avvisami al lancio'}
              </button>
            </form>
          ) : (
            <div className="wt-success">
              <div className="wt-success-icon">✓</div>
              <div>
                <strong>Sei in lista!</strong>
                <span>Ti avviseremo appena il wallet sara disponibile.</span>
              </div>
            </div>
          )}

          <div className="wt-footer-note">
            Oltre <strong>1.200 persone</strong> gia in lista d&apos;attesa
          </div>
        </div>
      </section>

      <div className="cta-final" data-anim="up">
        <div className="cta-inner">
          <h2>Non perdere un colpo.<br /><em>Iscriviti gratis.</em></h2>
          <p>Ricevi notifiche sugli eventi vicini a te, offerte esclusive e accesso prioritario alle prevendite.</p>
          <Link href="/register" className="ln-btn-primary big">Crea il tuo account</Link>
        </div>
      </div>

      <footer className="ln-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <div className="ln-logo-sm">Let&apos;s<span>Night</span></div>
            <p>Il TripAdvisor del divertimento.<br />Milano - Roma</p>
          </div>
          <div className="footer-links">
            <div className="fcol">
              <div className="fcol-label">Esplora</div>
              <Link href="/explore">Tutti gli eventi</Link>
              <Link href="/explore">Discoteche</Link>
              <Link href="/explore">Feste Uni</Link>
              <Link href="/explore">Cene Show</Link>
            </div>
            <div className="fcol">
              <div className="fcol-label">Account</div>
              <Link href="/login">Accedi</Link>
              <Link href="/register">Registrati</Link>
              <Link href="/dashboard">La mia area</Link>
            </div>
            <div className="fcol">
              <div className="fcol-label">Business</div>
              <Link href="/business">Porta il tuo locale</Link>
              <Link href="/business/login">Login locali</Link>
              <Link href="/business/dashboard">Dashboard</Link>
            </div>
          </div>
        </div>
        <div className="footer-base">&copy; 2026 Let&apos;s Night - Tutti i diritti riservati</div>
      </footer>
    </>
  );
}
