import it from './it.js';
import en from './en.js';
import es from './es.js';
import fr from './fr.js';

export const LANGS = [
  { code: 'it', label: 'Italiano' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
];

export const DEFAULT_LANG = 'it';

export const DICTS = { it, en, es, fr };

export function isValidLang(code) {
  return LANGS.some(l => l.code === code);
}

function lookup(obj, key) {
  return key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
}

// translate('en', 'settings.language') → 'Language'
// Interpolazione {param}; plurale via oggetto { one, other } quando params.count è presente.
// Fallback: lingua → italiano → chiave stessa (mai crash per chiave mancante).
export function translate(lang, key, params) {
  let val = lookup(DICTS[lang] || DICTS[DEFAULT_LANG], key);
  if (val == null && lang !== DEFAULT_LANG) val = lookup(DICTS[DEFAULT_LANG], key);
  if (val == null) return key;
  if (typeof val === 'object') {
    const n = params?.count;
    val = (n === 1 ? val.one : val.other) ?? key;
  }
  if (params) {
    for (const k of Object.keys(params)) {
      val = val.split('{' + k + '}').join(String(params[k]));
    }
  }
  return val;
}
