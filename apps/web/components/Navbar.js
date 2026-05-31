'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '../lib/supabase';

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(true); // sempre solid

  useEffect(() => {
    let cancelled = false;
    async function load(s) {
      setSession(s);
      if (s) {
        const { data: p } = await supabase
          .from('profiles')
          .select('role, display_name, full_name')
          .eq('id', s.user.id)
          .maybeSingle();
        if (!cancelled) setProfile(p);
      } else {
        if (!cancelled) setProfile(null);
      }
      if (!cancelled) setLoaded(true);
    }
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!cancelled) load(s);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!cancelled) load(s);
    });
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 60);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  async function handleLogout() {
    await supabase.auth.signOut();
    setMenuOpen(false);
    router.push('/');
  }

  const isBusiness = profile?.role === 'business';
  const profileHref = isBusiness ? '/business/dashboard' : '/dashboard';
  const displayName = profile?.display_name || profile?.full_name || session?.user?.email?.split('@')[0];

  return (
    <nav id="lnav" className={'lnav ' + (scrolled ? 'solid' : '')}>
      <Link href="/" className="ln-logo" onClick={() => setMenuOpen(false)}>
        Let&apos;s<span>Night</span>
        {isBusiness && <span className="biz-tag-nav" style={{ marginLeft: 6 }}>Business</span>}
      </Link>

      <div className={'ln-menu ' + (menuOpen ? 'open' : '')}>
        <Link href="/explore" onClick={() => setMenuOpen(false)}>Esplora</Link>
        <Link href="/search" onClick={() => setMenuOpen(false)}>Cerca</Link>

        {!loaded ? null : session ? (
          <>
            {!isBusiness && (
              <Link href="/loyalty" onClick={() => setMenuOpen(false)}>Fedeltà</Link>
            )}
            <Link href={profileHref} onClick={() => setMenuOpen(false)} className="ln-btn-ghost">
              {displayName ? `Ciao, ${displayName}` : 'Profilo'}
            </Link>
            <button onClick={handleLogout} className="ln-btn-ghost" style={{
              background: 'transparent', border: '1px solid var(--border)',
              padding: '8px 14px', borderRadius: 8, color: 'var(--text2)',
              cursor: 'pointer', fontSize: 13,
            }}>
              Esci
            </button>
          </>
        ) : (
          <>
            <Link href="/business" onClick={() => setMenuOpen(false)}>Per i Locali</Link>
            <Link href={`/login?next=${encodeURIComponent(pathname || '/')}`}
              className="ln-btn-ghost" onClick={() => setMenuOpen(false)}>Accedi</Link>
            <Link href="/register" className="ln-btn-primary" onClick={() => setMenuOpen(false)}>Iscriviti</Link>
          </>
        )}
      </div>

      <button className="ln-burger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
        <span /><span /><span />
      </button>
    </nav>
  );
}
