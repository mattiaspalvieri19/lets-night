'use client';

import { useEffect, useState, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { COLORS_BY_CAT, formatDateFull, formatTime, getPriceLabel, generateBookingQR, BOOKING_FEE } from '@lets-night/shared';
import Navbar from '../../../components/Navbar';

function isPastEvent(dateStr) {
  if (!dateStr) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(y, m - 1, d) < today;
}

export default function EventDetailPage({ params }) {
  const router = useRouter();
  const { id } = use(params);
  const cursorRef = useRef(null);
  const innerRef = useRef(null);
  const [event, setEvent] = useState(null);
  const [otherEvents, setOtherEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [bookingModal, setBookingModal] = useState(false);
  const [bookingQty, setBookingQty] = useState(1);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [bookingSuccess, setBookingSuccess] = useState(false);

  useEffect(() => {
    async function loadEvent() {
      setLoading(true);
      const { data, error } = await supabase
        .from('events')
        .select('*, venues(id, name, zona, city, address, phone, description, category)')
        .eq('id', id)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setEvent(data);

      // Carica altri eventi dello stesso locale
      if (data.venue_id) {
        const { data: others } = await supabase
          .from('events')
          .select('*, venues(name, zona, city)')
          .eq('venue_id', data.venue_id)
          .eq('is_active', true)
          .neq('id', id)
          .gte('event_date', new Date().toISOString().split('T')[0])
          .order('event_date', { ascending: true })
          .limit(4);
        setOtherEvents(others || []);
      }
      setLoading(false);
    }
    if (id) loadEvent();
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

  async function handleBook() {
    setBookingError('');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/login?next=' + encodeURIComponent('/event/' + id));
      return;
    }
    setBookingModal(true);
  }

  async function confirmBooking() {
    setBookingError('');
    setBookingLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setBookingError('Sessione scaduta. Torno al login...');
      setBookingLoading(false);
      setTimeout(() => router.push('/login?next=' + encodeURIComponent('/event/' + id)), 1500);
      return;
    }
    const safePrice = Math.max(0, Number(event.price) || 0);
    const isFree = safePrice === 0;
    const qty = isFree ? 1 : bookingQty;
    const { error } = await supabase.from('bookings').insert({
      user_id: session.user.id,
      event_id: event.id,
      status: 'confirmed',
      quantity: qty,
      total_price: isFree ? 0 : safePrice * qty,
      fee: isFree ? 0 : BOOKING_FEE,
      qr_code: generateBookingQR(),
    });
    setBookingLoading(false);
    if (error) {
      // 23505 = unique_violation: gestito dal nuovo UNIQUE (user_id, event_id) WHERE status != cancelled
      if (error.code === '23505') {
        setBookingError('Hai già prenotato questo evento.');
      } else {
        setBookingError('Prenotazione non riuscita. Riprova.');
        console.error('Errore booking:', error);
      }
      return;
    }
    setBookingSuccess(true);
  }

  function closeBookingModal() {
    setBookingModal(false);
    setBookingSuccess(false);
    setBookingError('');
    setBookingQty(1);
  }

  function shareWhatsApp() {
    const text = encodeURIComponent(`Dai un'occhiata a "${event.title}" su Let's Night! ${window.location.href}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="event-page-loading">
        <div className="spinner"></div>
        <p>Caricamento evento...</p>
      </div>
    );
  }

  if (notFound || !event) {
    return (
      <div className="event-page-loading">
        <h1 style={{fontSize:'3rem', marginBottom:'1rem'}}>Evento non trovato</h1>
        <p style={{color:'var(--text2)', marginBottom:'2rem'}}>Il link potrebbe essere scaduto o l evento rimosso.</p>
        <Link href="/" className="ln-btn-primary big">Torna alla home</Link>
      </div>
    );
  }

  const colors = COLORS_BY_CAT[event.category] || ['#1a0533','#0d0d1a','#c084fc'];
  const catClass = 'cat-' + event.category.toLowerCase().replace(/ /g,'-');
  const past = isPastEvent(event.event_date);
  const hasCapacity = event.capacity != null && event.capacity > 0;
  const availableSpots = hasCapacity ? event.capacity - (event.booked_count || 0) : null;
  const availabilityPct = hasCapacity ? Math.round((availableSpots / event.capacity) * 100) : null;
  const urgency = !hasCapacity || availabilityPct >= 50 ? 'high' : availabilityPct >= 20 ? 'medium' : 'low';

  return (
    <>
      <div className="cur-dot" ref={cursorRef} />
      <div className="cur-ring" ref={innerRef} />

      <Navbar />

      <div className="ev-hero" style={{ background: 'linear-gradient(135deg,' + colors[0] + ' 0%, ' + colors[1] + ' 100%)' }}>
        <div className="ev-hero-overlay" />
        <div className="ev-hero-content">
          <Link href="/" className="ev-breadcrumb">&larr; Tutti gli eventi</Link>
          
          <div className="ev-hero-top">
            <span className={'ev-cat ev-hero-cat ' + catClass}>{event.category}</span>
            {event.is_sponsored && <span className="ev-hero-badge-sp">In evidenza</span>}
            {event.is_hot && <span className="ev-hero-badge-hot">HOT</span>}
            {past && <span className="ev-hero-badge-past">Evento passato</span>}
          </div>

          <h1 className="ev-hero-title">{event.title}</h1>
          
          <div className="ev-hero-meta">
            {event.venues && (
              <Link href={'/venue/' + event.venues.id} className="ev-hero-venue">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z"/>
                  <circle cx="12" cy="9" r="2.5"/>
                </svg>
                <span>{event.venues.name}</span>
              </Link>
            )}
            <span className="ev-hero-divider">&middot;</span>
            <span className="ev-hero-zone">{event.venues?.zona}, {event.venues?.city}</span>
          </div>

          <div className="ev-hero-spheres">
            {[...Array(8)].map((_,i) => (
              <div key={i} className="ev-hero-sphere" style={{ 
                animationDelay: (i * 0.3) + 's',
                left: (10 + i * 11) + '%',
                background: 'radial-gradient(circle at 30% 30%, ' + colors[2] + '80, ' + colors[2] + '20 60%, transparent)',
              }} />
            ))}
          </div>
        </div>
      </div>

      <div className="ev-info-strip">
        <div className="ev-info-inner">
          <div className="ev-info-block">
            <span className="ev-info-label">Data</span>
            <strong className="ev-info-value">{formatDateFull(event.event_date)}</strong>
          </div>
          <div className="ev-info-divider" />
          <div className="ev-info-block">
            <span className="ev-info-label">Inizio</span>
            <strong className="ev-info-value">{formatTime(event.event_time)}</strong>
          </div>
          <div className="ev-info-divider" />
          <div className="ev-info-block">
            <span className="ev-info-label">Prezzo</span>
            <strong className="ev-info-value ev-price-big">{getPriceLabel(event.price)}</strong>
          </div>
          {hasCapacity && (
            <>
              <div className="ev-info-divider" />
              <div className="ev-info-block">
                <span className="ev-info-label">Disponibilita</span>
                <strong className={'ev-info-value ev-availability ev-avail-' + urgency}>
                  {availableSpots} / {event.capacity}
                </strong>
              </div>
            </>
          )}
          <div className="ev-info-cta">
            {past ? (
              <button className="ev-book-btn-disabled" disabled>Evento passato</button>
            ) : (
              <button className="ev-book-btn" onClick={handleBook}>
                Prenota ora &rarr;
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="ev-detail-grid">
        <div className="ev-detail-main">
          <section className="ev-section">
            <h2 className="ev-section-title">Descrizione</h2>
            <p className="ev-description">
              {event.description || 'Un evento imperdibile a ' + (event.venues?.city || 'Milano') + '. ' + 
                'Preparati per una serata all insegna del divertimento nella zona di ' + (event.venues?.zona || '') + '. ' +
                'Atmosfera unica, musica di qualita e tanti amici da incontrare.'}
            </p>
          </section>

          <section className="ev-section">
            <h2 className="ev-section-title">Dove si trova</h2>
            <div className="ev-location">
              <div className="ev-location-info">
                <strong className="ev-location-name">{event.venues?.name}</strong>
                <p className="ev-location-zone">{event.venues?.zona}, {event.venues?.city}</p>
                {event.venues?.address && <p className="ev-location-addr">{event.venues.address}</p>}
                {event.venues?.phone && (
                  <a href={'tel:' + event.venues.phone} className="ev-location-phone">
                    {event.venues.phone}
                  </a>
                )}
              </div>
              <div className="ev-location-map">
                <iframe
                  src={`https://maps.google.com/maps?q=${encodeURIComponent((event.venues?.address || '') + ' ' + (event.venues?.zona || '') + ' ' + (event.venues?.city || 'Milano'))}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                  width="100%"
                  height="280"
                  style={{ border: 0, borderRadius: '12px' }}
                  allowFullScreen=""
                  loading="lazy"
                />
              </div>
            </div>
          </section>

          {otherEvents.length > 0 && (
            <section className="ev-section">
              <h2 className="ev-section-title">Altri eventi di {event.venues?.name}</h2>
              <div className="ev-others">
                {otherEvents.map(o => (
                  <Link key={o.id} href={'/event/' + o.id} className="ev-other-card">
                    <div className="ev-other-visual" style={{ background: 'linear-gradient(135deg,' + (COLORS_BY_CAT[o.category]?.[0] || '#1a0533') + ',' + (COLORS_BY_CAT[o.category]?.[1] || '#0d0d1a') + ')' }}>
                      <span className={'ev-cat ' + ('cat-' + o.category.toLowerCase().replace(/ /g,'-'))}>{o.category}</span>
                    </div>
                    <div className="ev-other-body">
                      <h4>{o.title}</h4>
                      <div className="ev-other-date">{formatDateFull(o.event_date).split(',')[0] || new Date(o.event_date).toLocaleDateString('it-IT')} - {formatTime(o.event_time)}</div>
                      <div className="ev-other-price">{getPriceLabel(o.price)}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="ev-detail-aside">
          <div className="ev-aside-card">
            <h3 className="ev-aside-title">Il locale</h3>
            {event.venues && (
              <Link href={'/venue/' + event.venues.id} className="ev-venue-link">
                <div className="ev-venue-preview">
                  <strong>{event.venues.name}</strong>
                  <span>{event.venues.category}</span>
                  <span className="ev-venue-zone">{event.venues.zona}, {event.venues.city}</span>
                </div>
                <span className="ev-venue-arrow">&rarr;</span>
              </Link>
            )}
          </div>

          <div className="ev-aside-card">
            <h3 className="ev-aside-title">Condividi</h3>
            <div className="ev-share-buttons">
              <button onClick={shareWhatsApp} className="ev-share-btn ev-share-wa">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp
              </button>
              <button onClick={copyLink} className="ev-share-btn ev-share-copy">
                {copied ? 'Copiato!' : 'Copia link'}
              </button>
            </div>
          </div>

          <div className="ev-aside-card ev-aside-cta">
            <h3 className="ev-aside-title">Non perdere un colpo</h3>
            <p>Iscriviti gratis per ricevere notifiche sugli eventi della tua zona.</p>
            <Link href="/register" className="ln-btn-primary">Crea account</Link>
          </div>
        </aside>
      </div>

      {bookingModal && (
        <div className="book-modal-overlay" onClick={closeBookingModal}>
          <div className="book-modal" onClick={e => e.stopPropagation()}>
            {bookingSuccess ? (
              <div className="book-modal-success">
                <div className="book-modal-check">✓</div>
                <h2>Prenotato!</h2>
                <p>Trovi il tuo biglietto con QR code nella tua area.</p>
                <Link href="/dashboard" className="ln-btn-primary" onClick={closeBookingModal}>Vedi biglietto</Link>
              </div>
            ) : (
              <>
                <div className="book-modal-head">
                  <div>
                    <div className="book-modal-eyebrow">Prenota</div>
                    <h2 className="book-modal-title">{event.title}</h2>
                    <p className="book-modal-venue">{event.venues?.name}</p>
                  </div>
                  <button onClick={closeBookingModal} className="book-modal-close" aria-label="Chiudi">×</button>
                </div>

                <div className="book-modal-info">
                  <div><span>Data</span><strong>{formatDateFull(event.event_date)}</strong></div>
                  <div><span>Orario</span><strong>{formatTime(event.event_time) || '—'}</strong></div>
                </div>

                {event.price > 0 && (
                  <div className="book-modal-qty">
                    <span>Posti</span>
                    <div className="book-modal-qty-controls">
                      <button onClick={() => setBookingQty(q => Math.max(1, q - 1))}>−</button>
                      <strong>{bookingQty}</strong>
                      <button onClick={() => setBookingQty(q => Math.min(10, q + 1))}>+</button>
                    </div>
                  </div>
                )}

                <div className="book-modal-total">
                  <span>Totale</span>
                  <strong>{!event.price || event.price === 0 ? 'Gratuito' : `EUR ${event.price * bookingQty}`}</strong>
                </div>

                {bookingError && <div className="auth-error">{bookingError}</div>}

                <button onClick={confirmBooking} disabled={bookingLoading} className="ev-book-btn book-modal-confirm">
                  {bookingLoading ? 'Prenotazione...' : 'Conferma prenotazione'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

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
