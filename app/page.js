'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';

const CATS = ['Tutti','Discoteca','Universitario','Cena Show','VIP','Aperitivo'];

const COLORS_BY_CAT = {
  'Discoteca': ['#1a0533','#0d0d1a'],
  'Universitario': ['#001a33','#000d1a'],
  'Cena Show': ['#1a1200','#0d0900'],
  'VIP': ['#0a1a00','#050d00'],
  'Aperitivo': ['#001520','#000a10'],
};

function formatDate(dateStr) {
  const d = new Date(dateStr);
  const days = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
  const months = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
  return days[d.getDay()] + ' ' + d.getDate() + ' ' + months[d.getMonth()];
}

function formatTime(timeStr) {
  return timeStr ? timeStr.substring(0,5) : '';
}

function EventCard({ ev, delay }) {
  const catClass = 'cat-' + ev.category.toLowerCase().replace(/ /g,'-');
  const colors = COLORS_BY_CAT[ev.category] || ['#1a0533','#0d0d1a'];
  const priceLabel = ev.price > 0 ? 'EUR ' + ev.price : 'Lista';
  return (
    <Link href={'/event/' + ev.id} className="ev-card" data-anim="up" style={{ '--delay': delay + 'ms' }}>
      <div className="ev-visual" style={{ background:'linear-gradient(135deg,' + colors[0] + ',' + colors[1] + ')' }}>
        <div className="ev-top">
          <span className={'ev-cat ' + catClass}>{ev.category}</span>
          <div className="ev-badges">
            {ev.is_sponsored && <span className="badge-sp-sm">Sponsorizzato</span>}
            {ev.is_hot && <span className="badge-hot-sm">HOT</span>}
          </div>
        </div>
        <div className="ev-spheres">
          {[...Array(6)].map((_,i) => <div key={i} className="ev-sphere" style={{ animationDelay:(i*.2)+'s' }} />)}
        </div>
      </div>
      <div className="ev-body">
        <div className="ev-meta">
          <span className="ev-venue">{ev.venues?.name || 'Locale'}</span>
          <span className="ev-price">{priceLabel}</span>
        </div>
        <h3 className="ev-title">{ev.title}</h3>
        <div className="ev-info">
          <span className="ev-date">{formatDate(ev.event_date)} - {formatTime(ev.event_time)}</span>
        </div>
        <div className="ev-zona">{ev.venues?.zona}, {ev.venues?.city}</div>
      </div>
      <div className="ev-footer">
        <span className="ev-cta">Prenota ora</span>
      </div>
    </Link>
  );
}

export default function Home() {
  const cursorRef = useRef(null);
  const innerRef = useRef(null);
  const [city, setCity] = useState('Milano');
  const [cat, setCat] = useState('Tutti');
  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadEvents() {
      setLoading(true);
      const { data, error } = await supabase
        .from('events')
        .select('*, venues(name, zona, city)')
        .eq('is_active', true)
        .order('event_date', { ascending: true });
      if (error) console.error('Errore caricamento eventi:', error);
      else setEvents(data || []);
      setLoading(false);
    }
    loadEvents();
  }, []);

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
    const over = e => { if (e.target.closest('a,button,input,.ev-card')) ring.classList.add('expand'); };
    const out = () => ring.classList.remove('expand');
    document.addEventListener('mouseover', over);
    document.addEventListener('mouseout', out);
    const nav = document.getElementById('lnav');
    const onScroll = () => nav && nav.classList.toggle('solid', window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive:true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('mouseover', over);
      document.removeEventListener('mouseout', out);
      cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    const obs = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) e.target.classList.add('in');
      else e.target.classList.remove('in');
    }), { threshold:.1, rootMargin:'-8% 0px -8% 0px' });
    document.querySelectorAll('[data-anim]').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [events, loading]);

  const filtered = events.filter(e => {
    if (e.venues?.city !== city) return false;
    if (cat !== 'Tutti' && e.category !== cat) return false;
    if (search && !e.title.toLowerCase().includes(search.toLowerCase()) && !(e.venues?.name || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const sponsored = filtered.filter(e => e.is_sponsored);
  const rest = filtered.filter(e => !e.is_sponsored);

  return (
    <>
      <div className="cur-dot" ref={cursorRef} />
      <div className="cur-ring" ref={innerRef} />

      <nav className="lnav" id="lnav">
        <Link href="/" className="ln-logo">Let&apos;s<span>Night</span></Link>
        <div className={'ln-menu ' + (menuOpen ? 'open' : '')}>
          <Link href="/explore" onClick={() => setMenuOpen(false)}>Esplora</Link>
          <Link href="/business" onClick={() => setMenuOpen(false)}>Per i Locali</Link>
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
          <h1 className="hero-title" data-anim="up">Cosa fai<br /><em>stasera?</em></h1>
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

        {!loading && sponsored.length > 0 && (
          <>
            <div className="ev-section-label" data-anim="right">
              <span>In evidenza</span>
              <span className="badge-sp">Sponsorizzati</span>
            </div>
            <div className="ev-grid">
              {sponsored.map((e,i) => <EventCard key={e.id} ev={e} delay={i*80} />)}
            </div>
          </>
        )}

        {!loading && rest.length > 0 && (
          <>
            <div className="ev-section-label" data-anim="right" style={{ marginTop:'2.5rem' }}>
              <span>Tutti gli eventi</span>
              <span className="badge-hot">HOT</span>
            </div>
            <div className="ev-grid">
              {rest.map((e,i) => <EventCard key={e.id} ev={e} delay={i*80} />)}
            </div>
          </>
        )}

        {!loading && filtered.length === 0 && (
          <div className="empty-state" data-anim="up">
            <p>Nessun evento trovato per questa selezione.<br />Prova a cambiare filtro o citta.</p>
          </div>
        )}

        <div className="see-more-wrap" data-anim="up">
          <Link href="/explore" className="ln-btn-outline">Vedi tutti gli eventi</Link>
        </div>
      </section>

      <div className="business-banner" data-anim="up">
        <div className="bb-inner">
          <div className="bb-left">
            <div className="bb-label">Per i locali</div>
            <h2>Porta il tuo locale<br />su <em>Let&apos;s Night</em></h2>
            <p>Raggiungi migliaia di utenti ogni sera. Gestisci prenotazioni e guadagni dalla tua dashboard personale.</p>
          </div>
          <div className="bb-right">
            <div className="bb-stat"><strong>+340%</strong><span>visibilita media</span></div>
            <div className="bb-stat"><strong>EUR 0</strong><span>costo di attivazione</span></div>
            <Link href="/business" className="ln-btn-primary big">Inizia gratis</Link>
          </div>
        </div>
      </div>

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
