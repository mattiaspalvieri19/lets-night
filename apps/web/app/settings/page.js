'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import Navbar from '../../components/Navbar';

function SettingsLink({ href, icon, label, sub, danger }) {
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 16px',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        transition: 'background .15s',
      }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.05)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <span style={{ fontSize: 20, width: 36, textAlign: 'center' }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ color: danger ? '#F87171' : '#fff', fontWeight: 600, fontSize: 14 }}>{label}</div>
          {sub && <div style={{ color: 'var(--text2)', fontSize: 12, marginTop: 2 }}>{sub}</div>}
        </div>
        <span style={{ color: 'var(--text2)', fontSize: 16 }}>›</span>
      </div>
    </Link>
  );
}

function Section({ title, children, last }) {
  return (
    <div className="settings-section" style={{ marginBottom: last ? 0 : undefined, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px 4px', borderBottom: '1px solid var(--border)' }}>
        <p style={{ color: 'var(--text2)', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, margin: 0 }}>{title}</p>
      </div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login?next=/settings'); return; }
      setUser(session.user);
      setLoading(false);
    }
    load();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
  }

  if (loading) return <div className="dash-loading">Caricamento...</div>;

  return (
    <div className="settings-page">
      <Navbar />
      <div className="settings-container">
        <h1 className="settings-title">Impostazioni</h1>
        <p className="settings-sub">Gestisci il tuo profilo, la privacy e la sicurezza dell&apos;account.</p>

        <Section title="Profilo">
          <SettingsLink href="/settings/profile" icon="👤" label="Modifica profilo" sub="Nome, foto, bio, interessi, telefono" />
        </Section>

        <Section title="Preferenze">
          <SettingsLink href="/settings/privacy" icon="🛡️" label="Privacy" sub="Visibilità profilo e attività" />
        </Section>

        <Section title="Sicurezza">
          <SettingsLink href="/settings/password" icon="🔒" label="Cambia password" sub="Aggiorna la tua password di accesso" />
        </Section>

        <Section title="Account" last>
          <div
            onClick={handleLogout}
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '14px 16px', borderBottom: '1px solid var(--border)',
              cursor: 'pointer', transition: 'background .15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.05)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{ fontSize: 20, width: 36, textAlign: 'center' }}>🚪</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>Esci</div>
              <div style={{ color: 'var(--text2)', fontSize: 12, marginTop: 2 }}>{user?.email}</div>
            </div>
          </div>
          <SettingsLink href="/settings/account" icon="🗑️" label="Elimina account" sub="Rimozione definitiva di tutti i dati" danger />
        </Section>
      </div>
    </div>
  );
}
