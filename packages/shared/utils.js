import { BOOKING_FEE } from './constants.js';

const DAYS_SHORT  = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const DAYS_FULL   = ['Domenica', 'Lunedi', 'Martedi', 'Mercoledi', 'Giovedi', 'Venerdi', 'Sabato'];
const MONTHS_SHORT = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
const MONTHS_FULL  = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

// Parsa una stringa 'YYYY-MM-DD' come ora locale (non UTC) per evitare shift di data nelle timezone negative
function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// "Ven 15 Gen"
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = parseLocalDate(dateStr);
  return DAYS_SHORT[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()];
}

// "Venerdi 15 Gennaio 2026"
export function formatDateFull(dateStr) {
  if (!dateStr) return '';
  const d = parseLocalDate(dateStr);
  return DAYS_FULL[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS_FULL[d.getMonth()] + ' ' + d.getFullYear();
}

// "23:00"
export function formatTime(timeStr) {
  return timeStr ? timeStr.substring(0, 5) : '';
}

// "EUR 15" oppure "Gratuito" oppure "—" se prezzo non impostato
export function getPriceLabel(price) {
  if (price == null) return '—';
  return price > 0 ? 'EUR ' + price : 'Gratuito';
}

export function isPastDate(dateStr) {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return parseLocalDate(dateStr) < today;
}

// Differenza in giorni interi tra due date 'YYYY-MM-DD' interpretate in tz locale.
// new Date('YYYY-MM-DD') le interpreterebbe come UTC midnight, causando drift in tz non-UTC.
export function daysBetweenLocal(dateStrA, dateStrB) {
  if (!dateStrA || !dateStrB) return Infinity;
  const a = parseLocalDate(dateStrA);
  const b = parseLocalDate(dateStrB);
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
}

// Data di oggi in fuso locale come 'YYYY-MM-DD' (non UTC).
export function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// =================== LOYALTY ===================
// Livelli professionali. icon usata solo come optional small accent, non come hero.
export const LOYALTY_LEVELS = [
  { name: 'Member',  threshold: 0,    color: '#94A3B8' },
  { name: 'Insider', threshold: 200,  color: '#A855F7' },
  { name: 'Elite',   threshold: 600,  color: '#C084FC' },
  { name: 'VIP',     threshold: 1500, color: '#F59E0B' },
];

// Restituisce { level, next, progress (0-1), pointsToNext, threshold } dato il totale punti.
export function getLoyaltyLevel(points = 0) {
  const safe = Math.max(0, Number(points) || 0);
  let current = LOYALTY_LEVELS[0];
  let next = null;
  for (let i = 0; i < LOYALTY_LEVELS.length; i++) {
    if (safe >= LOYALTY_LEVELS[i].threshold) {
      current = LOYALTY_LEVELS[i];
      next = LOYALTY_LEVELS[i + 1] || null;
    }
  }
  const span = next ? next.threshold - current.threshold : 0;
  const earned = next ? safe - current.threshold : 0;
  return {
    level: current,
    next,
    progress: next ? Math.min(1, earned / span) : 1,
    pointsToNext: next ? Math.max(0, next.threshold - safe) : 0,
    points: safe,
  };
}

// QR univoco basato su CSPRNG quando disponibile (crypto.randomUUID — Node 19+, Hermes 0.74+, browser moderni).
// Math.random come fallback solo per ambienti legacy: i bouncer rilevano il riuso col flag checked_in.
export function generateBookingQR() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// Valida bookingType contro l'evento. Forza 'ticket' se 'table' non disponibile.
export function normalizeBookingType(event, requested) {
  if (requested === 'table' && event?.has_tables) return 'table';
  return 'ticket';
}

const MAX_QUANTITY_TICKETS = 10;

// Single source of truth per il calcolo prezzo prenotazione.
// Restituisce { effectivePrice, safeQty, lineTotal, fee, total, isFree, bookingType }.
// `quantity` viene clampata a [1, 10] per i biglietti, forzata a 1 per i tavoli.
export function computeBookingPrice(event, bookingType, quantity) {
  const type = normalizeBookingType(event, bookingType);
  const safePrice = Math.max(0, Number(event?.price) || 0);
  const rawTable = event?.table_price;
  // Distingui null/undefined (= "usa fallback price*4") da 0 esplicito (= tavolo gratis)
  const tableHasPrice = rawTable !== null && rawTable !== undefined && rawTable !== '';
  const safeTablePrice = tableHasPrice ? Math.max(0, Number(rawTable) || 0) : null;
  const effectivePrice = type === 'table'
    ? (tableHasPrice ? safeTablePrice : safePrice * 4)
    : safePrice;
  const safeQty = type === 'table'
    ? 1
    : Math.min(MAX_QUANTITY_TICKETS, Math.max(1, Number(quantity) || 1));
  const lineTotal = effectivePrice * safeQty;
  const isFree = lineTotal === 0;
  const fee = isFree ? 0 : BOOKING_FEE;
  return {
    bookingType: type,
    effectivePrice,
    safeQty,
    lineTotal,
    fee,
    total: lineTotal + fee,
    isFree,
  };
}

export function isInDateRange(dateStr, range) {
  if (!dateStr || range === 'all') return true;
  const d = parseLocalDate(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (range === 'today') return d.toDateString() === today.toDateString();
  if (range === 'week') {
    const end = new Date(today);
    end.setDate(end.getDate() + 7);
    return d >= today && d <= end;
  }
  if (range === 'month') {
    const end = new Date(today);
    end.setMonth(end.getMonth() + 1);
    return d >= today && d <= end;
  }
  return true;
}
