'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';

const DEFAULT = {
  searchable: true,
  profile_visibility: 'public',
  show_future_events: true,
  show_past_events: true,
  show_photos: true,
  show_badges: true,
  show_favorite_venues: true,
  show_followers: true,
  show_following: true,
};

const TOGGLES = [
  { key: 'searchable',          label: 'Mostrami nei risultati di ricerca', sub: 'Gli altri utenti possono trovarti dalla pagina Cerca' },
  { key: 'show_future_events',  label: 'Mostra serate a cui andrò',          sub: 'Eventi futuri visibili sul tuo profilo' },
  { key: 'show_past_events',    label: 'Mostra serate passate',              sub: 'Eventi a cui sei stato' },
  { key: 'show_photos',         label: 'Mostra foto serate' },
  { key: 'show_badges',         label: 'Mostra badge' },
  { key: 'show_favorite_venues',label: 'Mostra locali preferiti' },
  { key: 'show_followers',      label: 'Mostra follower' },
  { key: 'show_following',      label: 'Mostra chi segui' },
];

const VISIBILITY = [
  { id: 'public',    label: 'Pubblico',     desc: 'Chiunque può vedere il tuo profilo' },
  { id: 'followers', label: 'Solo follower', desc: 'Solo chi ti segue vede le tue attività' },
  { id: 'private',   label: 'Privato',       desc: 'Solo tu vedi le tue attività' },
];

export default function PrivacySettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [myId, setMyId] = useState(null);
  const [s, setS] = useState(DEFAULT);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login?next=/settings/privacy'); return; }
      setMyId(session.user.id);
      const { data } = await supabase.from('profiles').select('privacy_settings').eq('id', session.user.id).maybeSingle();
      if (data?.privacy_settings) setS({ ...DEFAULT, ...data.privacy_settings });
      setLoading(false);
    }
    load();
  }, [router]);

  async function persist(next) {
    setS(next);
    setSaving(true);
    // Debounce: salva solo l'ultimo stato dopo 400ms di inattività
    if (typeof window !== 'undefined') {
      if (window.__privacySaveTimer) clearTimeout(window.__privacySaveTimer);
      window.__privacySaveTimer = setTimeout(async () => {
        await supabase.from('profiles').update({ privacy_settings: next }).eq('id', myId);
        setSaving(false);
      }, 400);
    }
  }

  if (loading) return <div className="dash-loading">Caricamento...</div>;

  return (
    <div className="settings-page">
      <nav className="lnav solid">
        <Link href="/" className="ln-logo">Let&apos;s<span>Night</span></Link>
        <div className="ln-menu">
          <Link href="/dashboard">Profilo</Link>
        </div>
      </nav>

      <div className="settings-container">
        <h1 className="settings-title">Privacy</h1>
        <p className="settings-sub">Scegli cosa rendere visibile agli altri utenti.</p>

        <div className="settings-section">
          <h3>Visibilità profilo</h3>
          <div className="settings-visibility">
            {VISIBILITY.map(opt => (
              <div
                key={opt.id}
                onClick={() => persist({ ...s, profile_visibility: opt.id })}
                className={`visibility-option ${s.profile_visibility === opt.id ? 'active' : ''}`}>
                <div>
                  <div className="visibility-option-label">{opt.label}</div>
                  <div className="visibility-option-desc">{opt.desc}</div>
                </div>
                <div className="visibility-radio" />
              </div>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <h3>Cosa rendere visibile</h3>
          {TOGGLES.map(t => (
            <div key={t.key} className="settings-row">
              <div>
                <div className="settings-row-label">{t.label}</div>
                {t.sub && <div className="settings-row-sub">{t.sub}</div>}
              </div>
              <div className={`toggle ${s[t.key] ? 'on' : ''}`}
                onClick={() => persist({ ...s, [t.key]: !s[t.key] })}>
                <div className="toggle-knob" />
              </div>
            </div>
          ))}
        </div>

        <p style={{ color: 'var(--text2)', fontSize: 12, textAlign: 'center', marginTop: 20 }}>
          Email e telefono restano sempre privati. I dati di prenotazione non sono mai pubblici.
          {saving && <span style={{ display: 'block', color: 'var(--purple-light)', marginTop: 6 }}>Salvataggio...</span>}
        </p>
      </div>
    </div>
  );
}
