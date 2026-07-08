import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { translate, isValidLang, DEFAULT_LANG, formatDate, formatDateFull, getPriceLabel } from '@lets-night/shared';

const LANG_KEY = 'letsnight.lang';
// Lingua scelta esplicitamente da sloggato (pill login/registrazione): deve
// prevalere sul valore del profilo al primo accesso, altrimenti il profilo
// (settato in un login precedente) la sovrascriverebbe.
const LANG_PENDING_KEY = 'letsnight.lang.pending';

const I18nContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(DEFAULT_LANG);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(LANG_KEY);
        if (!cancelled && stored && isValidLang(stored)) setLangState(stored);
      } catch {}
      if (!cancelled) setReady(true);
    })();

    // Unico punto di sync col profilo: a ogni accesso (login o riapertura con
    // sessione) la lingua del profilo vince; se il profilo non ne ha una
    // (registrazione appena fatta o account pre-i18n) eredita quella locale.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION') || !session?.user?.id) return;
      (async () => {
        // Scelta esplicita pre-login (pill): vince sul profilo e lo aggiorna.
        const pending = await AsyncStorage.getItem(LANG_PENDING_KEY).catch(() => null);
        if (pending && isValidLang(pending)) {
          if (!cancelled) setLangState(pending);
          AsyncStorage.setItem(LANG_KEY, pending).catch(() => {});
          AsyncStorage.removeItem(LANG_PENDING_KEY).catch(() => {});
          const { error: upErr } = await supabase.from('profiles').update({ language: pending }).eq('id', session.user.id);
          if (upErr) console.error('Errore salvataggio lingua:', upErr);
          return;
        }
        const { data: p, error } = await supabase
          .from('profiles')
          .select('language')
          .eq('id', session.user.id)
          .maybeSingle();
        if (error || !p) return;
        if (p.language && isValidLang(p.language)) {
          if (!cancelled) setLangState(p.language);
          AsyncStorage.setItem(LANG_KEY, p.language).catch(() => {});
        } else {
          const local = await AsyncStorage.getItem(LANG_KEY).catch(() => null);
          const { error: upErr } = await supabase
            .from('profiles')
            .update({ language: (local && isValidLang(local)) ? local : DEFAULT_LANG })
            .eq('id', session.user.id);
          if (upErr) console.error('Errore salvataggio lingua:', upErr);
        }
      })();
    });

    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

  const setLang = useCallback(async (code) => {
    if (!isValidLang(code)) return;
    setLangState(code);
    AsyncStorage.setItem(LANG_KEY, code).catch(() => {});
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) {
      const { error } = await supabase.from('profiles').update({ language: code }).eq('id', session.user.id);
      if (error) console.error('Errore salvataggio lingua:', error);
    } else {
      // Da sloggato: ricorda la scelta per applicarla (con priorità) al login.
      AsyncStorage.setItem(LANG_PENDING_KEY, code).catch(() => {});
    }
  }, []);

  const value = useMemo(() => ({
    lang,
    ready,
    setLang,
    t: (key, params) => translate(lang, key, params),
    tLabel: (value) => {
      if (!value) return value;
      const k = 'labels.' + value;
      const r = translate(lang, k);
      return r === k ? value : r;
    },
    fmtDate: d => formatDate(d, lang),
    fmtDateFull: d => formatDateFull(d, lang),
    fmtPrice: p => getPriceLabel(p, lang),
  }), [lang, ready, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
