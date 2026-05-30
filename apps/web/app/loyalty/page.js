'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { getLoyaltyLevel, LOYALTY_LEVELS, formatDate } from '@lets-night/shared';

const REWARDS = [
  { id: 'r1', title: 'Sconto 10% prossimo biglietto', cost: 200, icon: '🎟️' },
  { id: 'r2', title: 'Drink omaggio', cost: 300, icon: '🍹' },
  { id: 'r3', title: 'Accesso prioritario', cost: 500, icon: '⚡' },
  { id: 'r4', title: 'Upgrade lista → tavolo', cost: 800, icon: '🍾' },
  { id: 'r5', title: 'Badge VIP visibile sul profilo', cost: 1500, icon: '👑' },
];

export default function LoyaltyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [points, setPoints] = useState(0);
  const [milestones, setMilestones] = useState([]);
  const [userMs, setUserMs] = useState({});
  const [history, setHistory] = useState([]);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login?next=/loyalty'); return; }
      const uid = session.user.id;

      const [{ data: prof }, { data: cat }, { data: um }, { data: bk }] = await Promise.all([
        supabase.from('profiles').select('loyalty_points').eq('id', uid).maybeSingle(),
        supabase.from('loyalty_milestones').select('*').order('category').order('points'),
        supabase.from('user_milestones').select('*').eq('user_id', uid),
        supabase.from('bookings')
          .select('id, created_at, total_price, events(title)')
          .eq('user_id', uid).neq('status', 'cancelled')
          .order('created_at', { ascending: false }).limit(10),
      ]);

      setPoints(prof?.loyalty_points || 0);
      setMilestones(cat || []);
      const map = {}; (um || []).forEach(r => map[r.milestone_id] = r);
      setUserMs(map);
      setHistory(bk || []);
      setLoading(false);
    }
    load();
  }, [router]);

  if (loading) return <div className="dash-loading">Caricamento...</div>;

  const ll = getLoyaltyLevel(points);
  const unlocked = milestones.filter(m => userMs[m.id]?.unlocked_at);
  const available = milestones.filter(m => !userMs[m.id]?.unlocked_at);

  return (
    <div className="loyalty-page">
      <nav className="lnav solid">
        <Link href="/" className="ln-logo">Let&apos;s<span>Night</span></Link>
        <div className="ln-menu">
          <Link href="/explore">Esplora</Link>
          <Link href="/search">Cerca</Link>
          <Link href="/dashboard">Profilo</Link>
        </div>
      </nav>

      <div className="loyalty-container">
        {/* Hero card */}
        <div className="loyalty-hero">
          <div className="eyebrow">La tua carta fedeltà</div>
          <div className="loyalty-points">{points}<small>punti totali</small></div>
          <div className="loyalty-level" style={{ color: ll.level.color }}>
            <span style={{ fontSize: 24 }}>{ll.level.icon}</span> {ll.level.name}
          </div>
          <div className="loyalty-progress">
            <div className="loyalty-progress-bar" style={{ width: `${Math.round(ll.progress * 100)}%` }} />
          </div>
          <div className="loyalty-progress-text">
            {ll.next
              ? `${ll.pointsToNext} punti al livello ${ll.next.name} ${ll.next.icon}`
              : '🎉 Hai raggiunto il livello massimo!'}
          </div>
        </div>

        {/* Ladder */}
        <div className="loyalty-ladder">
          {LOYALTY_LEVELS.map(l => {
            const reached = points >= l.threshold;
            return (
              <div key={l.name} className="loyalty-ladder-step" style={{ opacity: reached ? 1 : 0.35 }}>
                <div className="icon">{l.icon}</div>
                <div className="name" style={{ color: reached ? l.color : '#475569' }}>{l.name}</div>
                <div className="threshold">{l.threshold}p</div>
              </div>
            );
          })}
        </div>

        {/* Stats */}
        <div className="loyalty-stats">
          <div className="loyalty-stat-card"><strong>{unlocked.length}</strong><span>Badge sbloccati</span></div>
          <div className="loyalty-stat-card"><strong>{milestones.length}</strong><span>Badge totali</span></div>
          <div className="loyalty-stat-card"><strong>{history.length}</strong><span>Serate</span></div>
        </div>

        {/* Sbloccati */}
        {unlocked.length > 0 && (
          <section style={{ marginBottom: 28 }}>
            <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 900, marginBottom: 14 }}>
              ✓ Sbloccati ({unlocked.length})
            </h2>
            {unlocked.map(m => <Milestone key={m.id} m={m} unlocked progress={userMs[m.id]?.progress || m.goal} />)}
          </section>
        )}

        {/* Disponibili */}
        {available.length > 0 && (
          <section style={{ marginBottom: 28 }}>
            <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 900, marginBottom: 14 }}>
              Da sbloccare ({available.length})
            </h2>
            {available.map(m => <Milestone key={m.id} m={m} progress={userMs[m.id]?.progress || 0} />)}
          </section>
        )}

        {/* Premi */}
        <section style={{ marginBottom: 28 }}>
          <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 900, marginBottom: 14 }}>🎁 I tuoi premi</h2>
          {REWARDS.map(r => {
            const canRedeem = points >= r.cost;
            return (
              <div key={r.id} className={`reward ${canRedeem ? 'available' : ''}`}>
                <div className="reward-icon">{r.icon}</div>
                <div className="reward-body">
                  <div className="reward-title">{r.title}</div>
                  <div className="reward-cost">{r.cost} punti</div>
                </div>
                <div className="reward-btn">{canRedeem ? 'Riscatta' : 'Bloccato'}</div>
              </div>
            );
          })}
          <p style={{ color: 'var(--text2)', fontSize: 11, textAlign: 'center', fontStyle: 'italic', marginTop: 10 }}>
            Sistema premi in arrivo — punti già attivi.
          </p>
        </section>

        {/* Storico */}
        <section>
          <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 900, marginBottom: 14 }}>Storico recente</h2>
          {history.length === 0 ? (
            <div className="empty" style={{ padding: '2rem' }}>
              <div className="empty-sub">Nessun movimento. Prenota il tuo primo evento per accumulare punti.</div>
            </div>
          ) : (
            history.map(b => (
              <div key={b.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'var(--dark2)', border: '1px solid var(--border)',
                borderRadius: 12, padding: 14, marginBottom: 8,
              }}>
                <div>
                  <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{b.events?.title || 'Prenotazione'}</div>
                  <div style={{ color: 'var(--text2)', fontSize: 11, marginTop: 2 }}>
                    {formatDate(b.created_at?.split('T')[0])}
                  </div>
                </div>
                <strong style={{ color: 'var(--purple-light)', fontSize: 14 }}>+50</strong>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}

function Milestone({ m, unlocked, progress }) {
  const pct = Math.min(100, ((progress || 0) / (m.goal || 1)) * 100);
  return (
    <div className={`milestone ${unlocked ? 'unlocked' : ''}`}>
      <div className="milestone-icon">{m.icon || '🏆'}</div>
      <div className="milestone-body">
        <div className="milestone-title">
          <span>{m.title}</span>
          <strong>+{m.points}</strong>
        </div>
        <div className="milestone-desc">{m.description}</div>
        {unlocked ? (
          <div className="milestone-unlocked-label">✓ Sbloccato</div>
        ) : m.goal > 1 ? (
          <>
            <div className="milestone-progress">
              <div className="milestone-progress-bar" style={{ width: `${pct}%` }} />
            </div>
            <div className="milestone-progress-text">{progress || 0}/{m.goal}</div>
          </>
        ) : (
          <div className="milestone-progress-text" style={{ marginTop: 6 }}>Bloccato</div>
        )}
      </div>
    </div>
  );
}
