'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { getLoyaltyLevel, LOYALTY_LEVELS, formatDate } from '@lets-night/shared';
import Navbar from '../../components/Navbar';

const REWARDS = [
  { id: 'r1', title: 'Sconto 10% prossimo biglietto', cost: 200 },
  { id: 'r2', title: 'Drink omaggio', cost: 300 },
  { id: 'r3', title: 'Accesso prioritario', cost: 500 },
  { id: 'r4', title: 'Upgrade lista a tavolo', cost: 800 },
  { id: 'r5', title: 'Badge VIP sul profilo', cost: 1500 },
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
        supabase.from('loyalty_milestones').select('*').order('points'),
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
      <Navbar />

      <div className="loyalty-container">
        {/* Wallet-style card */}
        <div className="wallet-card">
          <div className="wallet-head">
            <span className="wallet-brand">Let&apos;s Night · Membership</span>
            <span className="wallet-level" style={{ color: ll.level.color }}>{ll.level.name.toUpperCase()}</span>
          </div>
          <div className="wallet-points">
            {points.toLocaleString()}
            <span>punti totali</span>
          </div>
          <div className="wallet-progress">
            <div className="wallet-progress-bar" style={{ width: `${Math.round(ll.progress * 100)}%`, background: ll.level.color }} />
          </div>
          <div className="wallet-progress-info">
            <span>{ll.next ? `Prossimo: ${ll.next.name}` : 'Livello massimo'}</span>
            {ll.next && <span className="wallet-progress-points">{ll.pointsToNext} punti</span>}
          </div>
          <div className="wallet-ladder">
            {LOYALTY_LEVELS.map((l) => {
              const reached = points >= l.threshold;
              const isCurrent = l.name === ll.level.name;
              return (
                <div key={l.name} className={'wallet-ladder-step ' + (isCurrent ? 'current' : '')}>
                  <div className="ladder-name" style={{ color: reached ? l.color : '#475569' }}>{l.name}</div>
                  <div className="ladder-threshold">{l.threshold}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Stats minimal */}
        <div className="loyalty-stats-minimal">
          <StatMini label="Sbloccati" value={unlocked.length} />
          <StatMini label="Totali" value={milestones.length} />
          <StatMini label="Serate" value={history.length} />
        </div>

        {unlocked.length > 0 && (
          <section className="loyalty-section">
            <h2>Sbloccati ({unlocked.length})</h2>
            {unlocked.map(m => <Milestone key={m.id} m={m} unlocked progress={userMs[m.id]?.progress || m.goal} />)}
          </section>
        )}

        {available.length > 0 && (
          <section className="loyalty-section">
            <h2>Traguardi disponibili</h2>
            {available.map(m => <Milestone key={m.id} m={m} progress={userMs[m.id]?.progress || 0} />)}
          </section>
        )}

        <section className="loyalty-section">
          <h2>Vantaggi</h2>
          {REWARDS.map(r => {
            const canRedeem = points >= r.cost;
            return (
              <div key={r.id} className="reward-row">
                <div className="reward-row-body">
                  <div className={'reward-row-title' + (canRedeem ? '' : ' muted')}>{r.title}</div>
                  <div className="reward-row-cost">{r.cost} punti</div>
                </div>
                <div className={'reward-row-btn ' + (canRedeem ? 'active' : '')}>
                  {canRedeem ? 'Riscatta' : 'Bloccato'}
                </div>
              </div>
            );
          })}
        </section>

        <section className="loyalty-section">
          <h2>Movimenti recenti</h2>
          {history.length === 0 ? (
            <p className="loyalty-empty-note">Prenota il tuo primo evento per iniziare ad accumulare punti.</p>
          ) : (
            history.map(b => (
              <div key={b.id} className="movement-row">
                <div>
                  <div className="movement-title">{b.events?.title || 'Prenotazione'}</div>
                  <div className="movement-date">{formatDate(b.created_at?.split('T')[0])}</div>
                </div>
                <strong className="movement-points">+50</strong>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}

function Milestone({ m, unlocked, progress }) {
  const goal = Math.max(1, m.goal || 1);
  const pct = Math.min(100, ((progress || 0) / goal) * 100);
  return (
    <div className={'milestone-row' + (unlocked ? ' unlocked' : '')}>
      <div className={'milestone-marker' + (unlocked ? ' unlocked' : '')}>
        {unlocked ? '✓' : <span className="dot" />}
      </div>
      <div className="milestone-row-body">
        <div className="milestone-row-head">
          <span className={unlocked ? 'milestone-title-active' : 'milestone-title-muted'}>{m.title}</span>
          <strong className="milestone-points">+{m.points}</strong>
        </div>
        {m.description && <div className="milestone-desc">{m.description}</div>}
        {!unlocked && goal > 1 && (
          <>
            <div className="milestone-progress-mini">
              <div style={{ width: `${pct}%` }} />
            </div>
            <div className="milestone-progress-text-mini">{progress || 0}/{goal}</div>
          </>
        )}
      </div>
    </div>
  );
}

function StatMini({ label, value }) {
  return (
    <div className="stat-mini">
      <div className="stat-mini-value">{value}</div>
      <div className="stat-mini-label">{label}</div>
    </div>
  );
}
