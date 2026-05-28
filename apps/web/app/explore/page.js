'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { CATS_NO_TUTTI as CATS, CITIES, COLORS_BY_CAT, formatDate, formatTime, isInDateRange, getPriceLabel } from '@lets-night/shared';

const DATE_RANGES = [
  { id: 'all', label: 'Tutte le date' },
  { id: 'today', label: 'Oggi' },
  { id: 'week', label: 'Questa settimana' },
  { id: 'month', label: 'Questo mese' },
];
const SORT_OPTIONS = [
  { id: 'date_asc', label: 'Data (prima i prossimi)' },
  { id: 'date_desc', label: 'Data (prima i lontani)' },
  { id: 'price_asc', label: 'Prezzo (dal piu basso)' },
  { id: 'price_desc', label: 'Prezzo (dal piu alto)' },
];

export default function ExplorePage() {
  const cursorRef = useRef(null);
  const innerRef = useRef(null);
  const [events, setEvents] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [search, setSearch] = useState('');
  const [selectedCities, setSelectedCities] = useState(['Milano','Roma']);
  const [selectedCats, setSelectedCats] = useState([]);
  const [selectedZone, setSelectedZone] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [priceMin, setPriceMin] = useState(0);
  const [priceMax, setPriceMax] = useState(200);
  const [sortBy, setSortBy] = useState('date_asc');

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('events')
        .select('*, venues(name, zona, city, is_partner)')
        .eq('is_active', true)
        .gte('event_date', today);
      const list = data || [];
      setEvents(list);
      const zonesSet = new Set(list.map(e => e.venues?.zona).filter(Boolean));
      setZones(Array.from(zonesSet).sort());
      setLoading(false);
    }
    loadData();
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
    const over = e => { if (e.target.closest('a,button,input,select,label,.ev-card')) ring.classList.add('expand'); };
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

  function toggleCity(c) {
    setSelectedCities(selectedCities.includes(c) ? selectedCities.filter(x => x !== c) : [...selectedCities, c]);
  }
  function toggleCat(c) {
    setSelectedCats(selectedCats.includes(c) ? selectedCats.filter(x => x !== c) : [...selectedCats, c]);
  }
  function resetFilters() {
    setSearch('');
    setSelectedCities(['Milano','Roma']);
    setSelectedCats([]);
    setSelectedZone('all');
    setDateRange('all');
    setPriceMin(0);
    setPriceMax(200);
    setSortBy('date_asc');
  }

  const filtered = events.filter(e => {
    if (!selectedCities.includes(e.venues?.city)) return false;
    if (selectedCats.length > 0 && !selectedCats.includes(e.category)) return false;
    if (selectedZone !== 'all' && e.venues?.zona !== selectedZone) return false;
    if (!isInDateRange(e.event_date, dateRange)) return false;
    const price = parseFloat(e.price) || 0;
    if (price < priceMin || price > priceMax) return false;
    if (search) {
      const q = search.toLowerCase();
      const matchTitle = e.title.toLowerCase().includes(q);
      const matchVenue = (e.venues?.name || '').toLowerCase().includes(q);
      const matchZone = (e.venues?.zona || '').toLowerCase().includes(q);
      if (!matchTitle && !matchVenue && !matchZone) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'date_asc') return new Date(a.event_date) - new Date(b.event_date);
    if (sortBy === 'date_desc') return new Date(b.event_date) - new Date(a.event_date);
    if (sortBy === 'price_asc') return (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0);
    if (sortBy === 'price_desc') return (parseFloat(b.price) || 0) - (parseFloat(a.price) || 0);
    return 0;
  });

  const activeFiltersCount = 
    (search ? 1 : 0) + 
    (selectedCities.length < 2 ? 1 : 0) +
    selectedCats.length +
    (selectedZone !== 'all' ? 1 : 0) +
    (dateRange !== 'all' ? 1 : 0) +
    ((priceMin > 0 || priceMax < 200) ? 1 : 0);

  return (
    <>
      <div className="cur-dot" ref={cursorRef} />
      <div className="cur-ring" ref={innerRef} />

      <nav className="lnav solid">
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

      <div className="xp-header">
        <div className="xp-header-inner">
          <div>
            <div className="sec-label">Esplora</div>
            <h1 className="xp-title">Tutti gli <em>eventi</em></h1>
            <p className="xp-sub">
              {loading ? 'Caricamento...' : sorted.length + ' ' + (sorted.length === 1 ? 'evento trovato' : 'eventi trovati')}
            </p>
          </div>
          <div className="xp-search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input 
              placeholder="Cerca evento, locale o zona..." 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
            />
            {search && <button className="xp-search-clear" onClick={() => setSearch('')}>×</button>}
          </div>
        </div>
      </div>

      <button className="xp-filters-mobile" onClick={() => setFiltersOpen(true)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="20" y2="12"/><line x1="14" y1="18" x2="20" y2="18"/><circle cx="8" cy="18" r="2"/></svg>
        Filtri {activeFiltersCount > 0 && <span className="xp-filters-count">{activeFiltersCount}</span>}
      </button>

      <div className="xp-layout">
        <aside className={'xp-filters ' + (filtersOpen ? 'open' : '')}>
          <div className="xp-filters-header">
            <h3>Filtri</h3>
            <button className="xp-filters-close" onClick={() => setFiltersOpen(false)}>×</button>
          </div>

          <div className="xp-filter-group">
            <label className="xp-filter-label">Citta</label>
            <div className="xp-checkbox-grid">
              {CITIES.map(c => (
                <label key={c} className={'xp-chip ' + (selectedCities.includes(c) ? 'active' : '')}>
                  <input type="checkbox" checked={selectedCities.includes(c)} onChange={() => toggleCity(c)} />
                  <span>{c}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="xp-filter-group">
            <label className="xp-filter-label">Categoria</label>
            <div className="xp-checkbox-list">
              {CATS.map(c => (
                <label key={c} className={'xp-chip xp-chip-full ' + (selectedCats.includes(c) ? 'active' : '')}>
                  <input type="checkbox" checked={selectedCats.includes(c)} onChange={() => toggleCat(c)} />
                  <span>{c}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="xp-filter-group">
            <label className="xp-filter-label">Quando</label>
            <div className="xp-radio-list">
              {DATE_RANGES.map(d => (
                <label key={d.id} className={'xp-chip xp-chip-full ' + (dateRange === d.id ? 'active' : '')}>
                  <input type="radio" name="dateRange" checked={dateRange === d.id} onChange={() => setDateRange(d.id)} />
                  <span>{d.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="xp-filter-group">
            <label className="xp-filter-label">Zona</label>
            <select className="xp-select" value={selectedZone} onChange={e => setSelectedZone(e.target.value)}>
              <option value="all">Tutte le zone</option>
              {zones.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>

          <div className="xp-filter-group">
            <label className="xp-filter-label">Prezzo: EUR {priceMin} - EUR {priceMax}</label>
            <div className="xp-price-inputs">
              <input 
                type="range" 
                min="0" 
                max="200" 
                step="5" 
                value={priceMin} 
                onChange={e => {
                  const v = parseInt(e.target.value);
                  if (v <= priceMax) setPriceMin(v);
                }}
                className="xp-slider"
              />
              <input 
                type="range" 
                min="0" 
                max="200" 
                step="5" 
                value={priceMax} 
                onChange={e => {
                  const v = parseInt(e.target.value);
                  if (v >= priceMin) setPriceMax(v);
                }}
                className="xp-slider"
              />
            </div>
          </div>

          <button className="xp-reset-btn" onClick={resetFilters}>
            Reset filtri
          </button>
        </aside>

        <main className="xp-results">
          <div className="xp-sort-bar">
            <span className="xp-sort-label">Ordina per:</span>
            <select className="xp-sort-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
              {SORT_OPTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>

          {loading && (
            <div className="loading-state"><p>Caricamento eventi...</p></div>
          )}

          {!loading && sorted.length === 0 && (
            <div className="xp-empty">
              <h3>Nessun evento trovato</h3>
              <p>Prova a modificare i filtri o resettarli per vedere piu risultati.</p>
              <button className="ln-btn-outline" onClick={resetFilters}>Reset filtri</button>
            </div>
          )}

          {!loading && sorted.length > 0 && (
            <div className="xp-grid">
              {sorted.map(ev => {
                const colors = COLORS_BY_CAT[ev.category] || ['#1a0533','#0d0d1a'];
                return (
                  <Link key={ev.id} href={'/event/' + ev.id} className="ev-card xp-card">
                    <div className="ev-visual" style={{ background: 'linear-gradient(135deg,' + colors[0] + ',' + colors[1] + ')' }}>
                      <div className="ev-top">
                        <span className={'ev-cat cat-' + ev.category.toLowerCase().replace(/ /g,'-')}>{ev.category}</span>
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
                      <span className={'ev-price' + (ev.price > 0 ? ' ev-price-paid' : '')}>{getPriceLabel(ev.price)}</span>
                      <span className="ev-cta">Prenota &rarr;</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {filtersOpen && <div className="xp-overlay" onClick={() => setFiltersOpen(false)} />}

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
