'use client';

import { useEffect, useState, useRef, use } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { COLORS_BY_CAT, formatDate, formatTime, getPriceLabel } from '@lets-night/shared';
import Navbar from '../../../components/Navbar';


function safeUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return ['http:', 'https:'].includes(u.protocol) ? url : null;
  } catch {
    return null;
  }
}

export default function VenueDetailPage({ params }) {
  const { id } = use(params);
  const cursorRef = useRef(null);
  const innerRef = useRef(null);
  const scrollerRef = useRef(null);
  const [venue, setVenue] = useState(null);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [pastEvents, setPastEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [user, setUser] = useState(null);
  const [isFav, setIsFav] = useState(false);
  const [favBusy, setFavBusy] = useState(false);

  useEffect(() => {
    async function loadVenue() {
      setLoading(true);
      const { data: venueData, error } = await supabase
        .from('venues')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !venueData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setVenue(venueData);

      const today = new Date().toISOString().split('T')[0];
      const [{ data: upcoming }, { data: past }] = await Promise.all([
        supabase.from('events').select('*, venues(name, zona, city)').eq('venue_id', id).eq('is_active', true).gte('event_date', today).order('event_date', { ascending: true }).limit(10),
        supabase.from('events').select('*, venues(name, zona, city)').eq('venue_id', id).eq('is_active', true).lt('event_date', today).order('event_date', { ascending: false }).limit(6),
      ]);
      setUpcomingEvents(upcoming || []);
      setPastEvents(past || []);

      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id || null;
      setUser(session?.user || null);

      if (uid) {
        const { data: fav } = await supabase
          .from('favorite_venues')
          .select('venue_id')
          .eq('user_id', uid).eq('venue_id', id).maybeSingle();
        setIsFav(!!fav);
      }

      setLoading(false);
    }
    if (id) loadVenue();
  }, [id]);

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
  }, [loading]);

  function scrollCarousel(dir) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  }

  async function toggleFavorite() {
    if (!user) {
      window.location.href = '/login?next=/venue/' + id;
      return;
    }
    setFavBusy(true);
    if (isFav) {
      const { error } = await supabase.from('favorite_venues')
        .delete().eq('user_id', user.id).eq('venue_id', id);
      if (!error) setIsFav(false);
      else alert('Impossibile rimuovere dai preferiti. Riprova.');
    } else {
      const { error } = await supabase.from('favorite_venues')
        .insert({ user_id: user.id, venue_id: id });
      if (!error) setIsFav(true);
      else alert('Impossibile aggiungere ai preferiti. Riprova.');
    }
    setFavBusy(false);
  }

  if (loading) {
    return (
      <div className="event-page-loading">
        <div className="spinner"></div>
        <p>Caricamento locale...</p>
      </div>
    );
  }

  if (notFound || !venue) {
    return (
      <div className="event-page-loading">
        <h1 style={{fontSize:'3rem', marginBottom:'1rem'}}>Locale non trovato</h1>
        <p style={{color:'var(--text2)', marginBottom:'2rem'}}>Il link potrebbe essere scaduto o il locale rimosso.</p>
        <Link href="/" className="ln-btn-primary big">Torna alla home</Link>
      </div>
    );
  }

  const colors = COLORS_BY_CAT[venue.category] || ['#1a0533','#0d0d1a','#c084fc'];

  return (
    <>
      <div className="cur-dot" ref={cursorRef} />
      <div className="cur-ring" ref={innerRef} />

      <Navbar />

      <div className="vn-hero" style={{ background: 'linear-gradient(135deg,' + colors[0] + ' 0%,' + colors[1] + ' 100%)' }}>
        <div className="vn-hero-overlay" />
        <div className="vn-hero-pattern">
          {[...Array(12)].map((_,i) => (
            <div key={i} className="vn-hero-dot" style={{ 
              left: (i * 8 + 5) + '%',
              top: (Math.sin(i) * 30 + 50) + '%',
              animationDelay: (i * 0.3) + 's',
              background: colors[2],
            }} />
          ))}
        </div>
        <div className="vn-hero-content">
          <Link href="/" className="ev-breadcrumb">&larr; Torna agli eventi</Link>
          
          <div className="vn-hero-top">
            <span className={'ev-cat ev-hero-cat cat-' + venue.category.toLowerCase().replace(/ /g,'-')}>{venue.category}</span>
            {venue.is_verified && (
              <span className="vn-badge-verified">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>
                </svg>
                Verificato
              </span>
            )}
            {venue.is_partner && <span className="vn-badge-partner">Partner</span>}
          </div>

          <h1 className="vn-hero-title">{venue.name}</h1>
          
          <div className="vn-hero-meta">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z"/>
              <circle cx="12" cy="9" r="2.5"/>
            </svg>
            <span>{venue.zona}, {venue.city}</span>
          </div>

          <div className="vn-hero-stats">
            <div className="vn-stat">
              <strong>{upcomingEvents.length}</strong>
              <span>prossimi eventi</span>
            </div>
            <div className="vn-stat-div" />
            <div className="vn-stat">
              <strong>{upcomingEvents.length + pastEvents.length}</strong>
              <span>eventi totali</span>
            </div>
            <div className="vn-stat-div" />
            <div className="vn-stat">
              <strong>4.6</strong>
              <span>rating medio</span>
            </div>
          </div>
        </div>
      </div>

      <div className="vn-action-strip">
        <div className="vn-action-inner">
          <div className="vn-contacts">
            {venue.address && (
              <div className="vn-contact-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z"/></svg>
                <span>{venue.address}</span>
              </div>
            )}
            {venue.phone && (
              <a href={'tel:' + venue.phone} className="vn-contact-item vn-contact-link">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                <span>{venue.phone}</span>
              </a>
            )}
            {venue.instagram && (
              <a href={'https://instagram.com/' + venue.instagram.replace('@','')} target="_blank" rel="noopener noreferrer" className="vn-contact-item vn-contact-link">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
                <span>{venue.instagram}</span>
              </a>
            )}
            {safeUrl(venue.website) && (
              <a href={safeUrl(venue.website)} target="_blank" rel="noopener noreferrer" className="vn-contact-item vn-contact-link">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                <span>Sito web</span>
              </a>
            )}
          </div>
          <button className={'vn-follow-btn ' + (isFav ? 'active' : '')} onClick={toggleFavorite} disabled={favBusy}>
            {favBusy ? '...' : (isFav ? '❤️ Preferito' : '🤍 Aggiungi ai preferiti')}
          </button>
        </div>
      </div>

      <div className="vn-detail-grid">
        <div className="vn-detail-main">
          <section className="ev-section">
            <h2 className="ev-section-title">Chi siamo</h2>
            <p className="ev-description">
              {venue.description || venue.name + ' e uno dei locali piu interessanti nella zona di ' + venue.zona + ' a ' + venue.city + '. ' +
                'Categoria: ' + venue.category + '. Atmosfera curata, musica selezionata e un ambiente pensato per garantire una serata indimenticabile. ' +
                'Consulta la lista eventi qui sotto per scoprire cosa ci aspetta nei prossimi giorni.'}
            </p>
          </section>

          {upcomingEvents.length > 0 && (
            <section className="ev-section">
              <div className="vn-section-header">
                <h2 className="ev-section-title">Prossimi eventi</h2>
                <span className="vn-events-count">{upcomingEvents.length} {upcomingEvents.length === 1 ? 'evento' : 'eventi'}</span>
              </div>
              <div className="carousel-wrap">
                {upcomingEvents.length > 3 && (
                  <>
                    <button className="carousel-arrow carousel-arrow-left" onClick={() => scrollCarousel(-1)}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                    </button>
                    <button className="carousel-arrow carousel-arrow-right" onClick={() => scrollCarousel(1)}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                  </>
                )}
                <div className="ev-scroller" ref={scrollerRef}>
                  {upcomingEvents.map(ev => {
                    const evColors = COLORS_BY_CAT[ev.category] || ['#1a0533','#0d0d1a'];
                    return (
                      <Link key={ev.id} href={'/event/' + ev.id} className="ev-card">
                        <div className="ev-visual" style={{ background: 'linear-gradient(135deg,' + evColors[0] + ',' + evColors[1] + ')' }}>
                          <div className="ev-top">
                            <span className={'ev-cat cat-' + ev.category.toLowerCase().replace(/ /g,'-')}>{ev.category}</span>
                          </div>
                          <div className="ev-spheres">
                            {[0,1,2,3,4,5].map(j => <div key={j} className="ev-sphere" style={{ animationDelay:(j*.2)+'s' }} />)}
                          </div>
                        </div>
                        <div className="ev-body">
                          <div className="ev-venue">{venue.name}</div>
                          <h3 className="ev-title">{ev.title}</h3>
                          <div className="ev-date">{formatDate(ev.event_date)} - {formatTime(ev.event_time)}</div>
                          <div className="ev-zona">{venue.zona}, {venue.city}</div>
                        </div>
                        <div className="ev-footer">
                          <span className="ev-price">{getPriceLabel(ev.price)}</span>
                          <span className="ev-cta">Prenota &rarr;</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {upcomingEvents.length === 0 && (
            <section className="ev-section">
              <h2 className="ev-section-title">Prossimi eventi</h2>
              <div className="vn-no-events">
                <p>Nessun evento in programma al momento.</p>
                <p style={{fontSize:'13px', marginTop:'.5rem'}}>Segui il locale per essere avvisato quando ne pubblicheranno di nuovi.</p>
              </div>
            </section>
          )}

          <section className="ev-section">
            <h2 className="ev-section-title">Dove si trova</h2>
            <div className="vn-map-wrap">
              <iframe
                src={`https://maps.google.com/maps?q=${encodeURIComponent((venue.address || '') + ' ' + venue.zona + ' ' + venue.city)}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                width="100%"
                height="360"
                style={{ border: 0, borderRadius: '12px' }}
                allowFullScreen=""
                loading="lazy"
              />
            </div>
          </section>

          {pastEvents.length > 0 && (
            <section className="ev-section">
              <button className="vn-past-toggle" onClick={() => setShowPast(!showPast)}>
                <span>Eventi passati ({pastEvents.length})</span>
                <span className="vn-past-arrow">{showPast ? '▲' : '▼'}</span>
              </button>
              {showPast && (
                <div className="vn-past-list">
                  {pastEvents.slice(0, 10).map(e => (
                    <Link key={e.id} href={'/event/' + e.id} className="vn-past-item">
                      <div>
                        <strong>{e.title}</strong>
                        <span>{formatDate(e.event_date)} - {formatTime(e.event_time)}</span>
                      </div>
                      <span className="vn-past-price">{getPriceLabel(e.price)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="ev-detail-aside">
          <div className="ev-aside-card">
            <h3 className="ev-aside-title">Contatti rapidi</h3>
            <div className="vn-contacts-stack">
              {venue.phone && (
                <a href={'tel:' + venue.phone} className="vn-contact-row">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  <div><span>Telefono</span><strong>{venue.phone}</strong></div>
                </a>
              )}
              {venue.instagram && (
                <a href={'https://instagram.com/' + venue.instagram.replace('@','')} target="_blank" rel="noopener noreferrer" className="vn-contact-row">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
                  <div><span>Instagram</span><strong>{venue.instagram}</strong></div>
                </a>
              )}
              {safeUrl(venue.website) && (
                <a href={safeUrl(venue.website)} target="_blank" rel="noopener noreferrer" className="vn-contact-row">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
                  <div><span>Sito web</span><strong>Visita il sito &rarr;</strong></div>
                </a>
              )}
              {venue.address && (
                <div className="vn-contact-row">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
                  <div><span>Indirizzo</span><strong>{venue.address}</strong></div>
                </div>
              )}
            </div>
          </div>

          <div className="ev-aside-card">
            <h3 className="ev-aside-title">Orari tipici</h3>
            <p style={{fontSize:'13px', color:'var(--text2)', lineHeight:1.7}}>
              Gli orari variano in base all evento.<br />
              Controlla la pagina di ogni serata per dettagli.
            </p>
          </div>

          <div className="ev-aside-card ev-aside-cta">
            <h3 className="ev-aside-title">Sei il proprietario?</h3>
            <p>Rivendica questo locale e gestisci eventi e prenotazioni dalla tua dashboard.</p>
            <Link href="/business/register" className="ln-btn-primary">Diventa partner</Link>
          </div>
        </aside>
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
            </div>
            <div className="fcol">
              <div className="fcol-label">Account</div>
              <Link href="/login">Accedi</Link>
              <Link href="/register">Registrati</Link>
            </div>
            <div className="fcol">
              <div className="fcol-label">Business</div>
              <Link href="/business">Porta il tuo locale</Link>
            </div>
          </div>
        </div>
        <div className="footer-base">&copy; 2026 Let&apos;s Night</div>
      </footer>
    </>
  );
}
