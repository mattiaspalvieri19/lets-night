export const CATS = ['Tutti', 'Discoteca', 'Universitario', 'Cena Show', 'VIP', 'Aperitivo'];

export const CATS_NO_TUTTI = ['Discoteca', 'Universitario', 'Cena Show', 'VIP', 'Aperitivo'];

// Tag aggiuntivi mostrati come chip in Home (oltre alle categorie principali)
export const QUICK_TAGS = ['Live Music', 'Gratis', 'Tavoli', 'Guestlist', 'After dinner'];

// Tipi musicali / dress code / fasce / target età (per filtri avanzati + form business)
export const MUSIC_TYPES   = ['Commerciale', 'House', 'Techno', 'Hip Hop', 'Reggaeton', 'Live', 'Anni 90/2000', 'Lounge'];
export const DRESS_CODES   = ['Casual', 'Smart casual', 'Elegante', 'Black tie', 'Tema serata'];
export const AGE_TARGETS   = ['18+', '21+', '25+', '30+', 'Universitari', 'Tutte le età'];
export const TIME_SLOTS    = [
  { id: 'aperitivo', label: 'Aperitivo (18-21)' },
  { id: 'cena',      label: 'Cena (20-23)' },
  { id: 'serata',    label: 'Serata (22-02)' },
  { id: 'after',     label: 'After (02+)' },
];
export const INTERESTS_OPTIONS = [
  'Discoteca', 'Aperitivo', 'Universitario', 'VIP', 'Live Music',
  'Techno', 'House', 'Hip Hop', 'Cena Show', 'Lounge',
];

// Lancio Milano-only. Per espandere (es. Roma): aggiungi qui la città e i selettori
// città ricompaiono ovunque automaticamente (sono nascosti finché CITIES.length === 1).
export const CITIES = ['Milano'];
export const DEFAULT_CITY = CITIES[0];

// [gradiente-scuro, gradiente-chiaro, colore-accento]
export const COLORS_BY_CAT = {
  'Discoteca':     ['#1a0533', '#0d0d1a', '#c084fc'],
  'Universitario': ['#001a33', '#000d1a', '#60a5fa'],
  'Cena Show':     ['#1a1200', '#0d0900', '#fb923c'],
  'VIP':           ['#0a1a00', '#050d00', '#fbbf24'],
  'Aperitivo':     ['#001520', '#000a10', '#4ade80'],
};

export const BRAND_COLOR = '#12A0D7';

// Commissione per prenotazione (EUR). Centralizzata per non avere drift web/mobile.
export const BOOKING_FEE = 1.50;
