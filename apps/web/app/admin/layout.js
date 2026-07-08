'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '../../lib/supabase';

const SECTIONS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/events', label: 'Eventi' },
  { href: '/admin/bookings', label: 'Prenotazioni' },
  { href: '/admin/venues', label: 'Locali' },
  { href: '/admin/users', label: 'Utenti' },
  { href: '/admin/support', label: 'Assistenza' },
];

export default function AdminLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login?next=/admin');
        return;
      }
      const { data: adminRow } = await supabase
        .from('admins')
        .select('user_id')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (!cancelled) setStatus(adminRow ? 'ok' : 'denied');
    })();
    return () => { cancelled = true; };
  }, [router]);

  if (status === 'loading') return <div className="dash-loading">Caricamento admin...</div>;
  if (status === 'denied') return (
    <div className="dash-loading">
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ color: '#fff', marginBottom: '1rem' }}>Accesso negato</h2>
        <p style={{ color: 'var(--text2)' }}>Questa pagina è riservata agli amministratori.</p>
        <Link href="/" style={{ color: 'var(--purple-light)', marginTop: '1rem', display: 'inline-block' }}>Torna alla home</Link>
      </div>
    </div>
  );

  return (
    <div className="dash-page">
      <nav className="lnav solid">
        <Link href="/" className="ln-logo">
          Let&apos;s<span>Night</span> <span className="admin-badge" style={{ marginLeft: 6 }}>Admin</span>
        </Link>
      </nav>
      <div style={{ paddingTop: '5.5rem' }}>
        <div className="admin-subnav">
          {SECTIONS.map(s => {
            const active = s.href === '/admin' ? pathname === '/admin' : pathname.startsWith(s.href);
            return (
              <Link key={s.href} href={s.href} className={active ? 'active' : ''}>{s.label}</Link>
            );
          })}
        </div>
        {children}
      </div>
    </div>
  );
}
