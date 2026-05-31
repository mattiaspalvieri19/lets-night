import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/useSession';
import { getLoyaltyLevel, LOYALTY_LEVELS, formatDate } from '@lets-night/shared';
import MilestoneCard from '../components/MilestoneCard';
import EmptyState from '../components/EmptyState';

// Premi sblocabili (mock realistici, da collegare al backend in fase futura)
const REWARDS_MOCK = [
  { id: 'r1', title: 'Sconto 10% prossimo biglietto', cost: 200, icon: '🎟️', enabled: true },
  { id: 'r2', title: 'Drink omaggio', cost: 300, icon: '🍹', enabled: true },
  { id: 'r3', title: 'Accesso prioritario', cost: 500, icon: '⚡', enabled: true },
  { id: 'r4', title: 'Upgrade lista → tavolo', cost: 800, icon: '🍾', enabled: true },
  { id: 'r5', title: 'Badge VIP visibile sul profilo', cost: 1500, icon: '👑', enabled: true },
];

function Section({ title, children, action }) {
  return (
    <View style={{ marginBottom: 28 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, paddingHorizontal: 20 }}>
        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900' }}>{title}</Text>
        {action}
      </View>
      <View style={{ paddingHorizontal: 20 }}>{children}</View>
    </View>
  );
}

export default function LoyaltyScreen() {
  const { session } = useSession();
  const myId = session?.user?.id;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [points, setPoints] = useState(0);
  const [milestones, setMilestones] = useState([]); // catalogo completo
  const [userMilestones, setUserMilestones] = useState({}); // map milestone_id → {progress, unlocked_at}
  const [history, setHistory] = useState([]); // bookings recenti come "movimenti punti"

  async function loadAll() {
    if (!myId) return;
    const [{ data: prof }, { data: cat, error: catErr }, { data: um }, { data: bk }] = await Promise.all([
      supabase.from('profiles').select('loyalty_points').eq('id', myId).maybeSingle(),
      supabase.from('loyalty_milestones').select('*').order('category').order('points'),
      supabase.from('user_milestones').select('*').eq('user_id', myId),
      supabase.from('bookings')
        .select('id, created_at, total_price, status, events(title)')
        .eq('user_id', myId)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(10),
    ]);
    if (catErr) console.error('Errore loyalty_milestones:', catErr);
    setPoints(prof?.loyalty_points || 0);
    setMilestones(cat || []);
    const map = {};
    (um || []).forEach(r => { map[r.milestone_id] = r; });
    setUserMilestones(map);
    setHistory(bk || []);
  }

  useFocusEffect(useCallback(() => {
    setLoading(true);
    loadAll().finally(() => setLoading(false));
  }, [myId]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [myId]);

  if (!myId) {
    return (
      <View style={{ flex: 1, backgroundColor: '#09090f' }}>
        <EmptyState
          icon="🌙"
          title="Accedi per la tua carta fedeltà"
          subtitle="Accumula punti con ogni serata e sblocca premi esclusivi."
          actionLabel="Accedi"
          onAction={() => router.push('/auth/login')}
        />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#09090f', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#A855F7" size="large" />
      </View>
    );
  }

  const ll = getLoyaltyLevel(points);
  const unlockedMilestones = milestones.filter(m => userMilestones[m.id]?.unlocked_at);
  const availableMilestones = milestones.filter(m => !userMilestones[m.id]?.unlocked_at);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#09090f' }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#A855F7" />}
    >
      {/* Hero level card */}
      <View style={{ padding: 20, paddingTop: 16 }}>
        <View style={{
          borderRadius: 20,
          overflow: 'hidden',
          backgroundColor: '#111118',
          borderWidth: 1, borderColor: 'rgba(168,85,247,0.35)',
        }}>
          <View style={{
            padding: 22,
            backgroundColor: 'rgba(124,58,237,0.18)',
          }}>
            <Text style={{ color: '#A855F7', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', fontWeight: '700' }}>
              La tua carta fedeltà
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 10, gap: 8 }}>
              <Text style={{ color: '#fff', fontSize: 42, fontWeight: '900', letterSpacing: -1 }}>{points}</Text>
              <Text style={{ color: '#9CA3AF', fontSize: 14, fontWeight: '700' }}>punti totali</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <Text style={{ fontSize: 22 }}>{ll.level.icon}</Text>
              <Text style={{ color: ll.level.color, fontWeight: '900', fontSize: 18 }}>{ll.level.name}</Text>
            </View>

            {/* Progress to next level */}
            <View style={{ marginTop: 18 }}>
              <View style={{
                height: 8, borderRadius: 4,
                backgroundColor: 'rgba(168,85,247,0.18)',
                overflow: 'hidden',
              }}>
                <View style={{
                  width: `${Math.round(ll.progress * 100)}%`,
                  height: '100%',
                  backgroundColor: '#A855F7',
                }} />
              </View>
              <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 8 }}>
                {ll.next
                  ? `${ll.pointsToNext} punti al livello ${ll.next.name} ${ll.next.icon}`
                  : '🎉 Hai raggiunto il livello massimo!'}
              </Text>
            </View>
          </View>

          {/* Tutti i livelli (mini ladder) */}
          <View style={{
            flexDirection: 'row', justifyContent: 'space-between',
            padding: 16, paddingTop: 14,
            borderTopWidth: 1, borderTopColor: 'rgba(168,85,247,0.12)',
          }}>
            {LOYALTY_LEVELS.map(l => {
              const reached = points >= l.threshold;
              return (
                <View key={l.name} style={{ alignItems: 'center', flex: 1 }}>
                  <Text style={{ fontSize: 22, opacity: reached ? 1 : 0.35 }}>{l.icon}</Text>
                  <Text style={{
                    color: reached ? l.color : '#475569',
                    fontSize: 10, marginTop: 4, fontWeight: '700',
                  }}>
                    {l.name}
                  </Text>
                  <Text style={{ color: '#475569', fontSize: 9, marginTop: 1 }}>{l.threshold}p</Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>

      {/* Stats compatti */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginBottom: 6 }}>
        <View style={{ flex: 1, backgroundColor: '#111118', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(168,85,247,0.12)' }}>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900' }}>{unlockedMilestones.length}</Text>
          <Text style={{ color: '#64748B', fontSize: 11, marginTop: 2 }}>Badge sbloccati</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: '#111118', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(168,85,247,0.12)' }}>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900' }}>{milestones.length}</Text>
          <Text style={{ color: '#64748B', fontSize: 11, marginTop: 2 }}>Badge totali</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: '#111118', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(168,85,247,0.12)' }}>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900' }}>{history.length}</Text>
          <Text style={{ color: '#64748B', fontSize: 11, marginTop: 2 }}>Serate</Text>
        </View>
      </View>

      <View style={{ height: 24 }} />

      {/* Sbloccati */}
      {unlockedMilestones.length > 0 && (
        <Section title={`✓ Sbloccati (${unlockedMilestones.length})`}>
          {unlockedMilestones.map(m => (
            <MilestoneCard
              key={m.id}
              milestone={m}
              unlocked
              progress={userMilestones[m.id]?.progress || m.goal}
            />
          ))}
        </Section>
      )}

      {/* Disponibili */}
      {availableMilestones.length > 0 && (
        <Section title={`Da sbloccare (${availableMilestones.length})`}>
          {availableMilestones.map(m => (
            <MilestoneCard
              key={m.id}
              milestone={m}
              unlocked={false}
              progress={userMilestones[m.id]?.progress || 0}
            />
          ))}
        </Section>
      )}

      {/* Premi */}
      <Section title="🎁 I tuoi premi">
        {REWARDS_MOCK.map(r => {
          const canRedeem = points >= r.cost;
          return (
            <View key={r.id} style={{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              backgroundColor: '#111118', borderRadius: 12, padding: 14, marginBottom: 10,
              borderWidth: 1, borderColor: canRedeem ? 'rgba(74,222,128,0.3)' : 'rgba(168,85,247,0.12)',
              opacity: canRedeem ? 1 : 0.7,
            }}>
              <View style={{
                width: 40, height: 40, borderRadius: 20,
                backgroundColor: canRedeem ? 'rgba(74,222,128,0.15)' : 'rgba(168,85,247,0.12)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 18 }}>{r.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{r.title}</Text>
                <Text style={{ color: '#9CA3AF', fontSize: 11, marginTop: 2 }}>{r.cost} punti</Text>
              </View>
              <View style={{
                paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
                backgroundColor: canRedeem ? '#4ADE80' : '#18181f',
                borderWidth: 1, borderColor: canRedeem ? '#4ADE80' : 'rgba(168,85,247,0.18)',
              }}>
                <Text style={{ color: canRedeem ? '#09090f' : '#64748B', fontSize: 11, fontWeight: '800' }}>
                  {canRedeem ? 'Riscatta' : 'Bloccato'}
                </Text>
              </View>
            </View>
          );
        })}
        <Text style={{ color: '#64748B', fontSize: 11, fontStyle: 'italic', marginTop: 4, textAlign: 'center' }}>
          Sistema riscatto premi in arrivo
        </Text>
      </Section>

      {/* Storico */}
      <Section title="Storico recente">
        {history.length === 0 ? (
          <View style={{ backgroundColor: '#111118', borderRadius: 12, padding: 18, borderWidth: 1, borderColor: 'rgba(168,85,247,0.12)' }}>
            <Text style={{ color: '#64748B', fontSize: 13, textAlign: 'center' }}>
              Nessun movimento. Prenota il tuo primo evento per iniziare ad accumulare punti!
            </Text>
          </View>
        ) : history.map(b => (
          <View key={b.id} style={{
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            backgroundColor: '#111118', borderRadius: 12, padding: 12, marginBottom: 8,
            borderWidth: 1, borderColor: 'rgba(168,85,247,0.1)',
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
                {b.events?.title || 'Prenotazione'}
              </Text>
              <Text style={{ color: '#64748B', fontSize: 11, marginTop: 2 }}>
                {formatDate(b.created_at?.split('T')[0])}
              </Text>
            </View>
            <Text style={{ color: '#A855F7', fontWeight: '800', fontSize: 13 }}>+50</Text>
          </View>
        ))}
      </Section>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}
