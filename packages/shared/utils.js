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

// UUID v4 generato con Math.random — sufficiente per QR ticket (entropy 122 bit).
// Hermes/RN compatibile (non usa crypto.randomUUID che non sempre esiste).
export function generateBookingQR() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
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
