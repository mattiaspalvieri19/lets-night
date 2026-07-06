import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useI18n } from '../lib/i18n';
import { useSession } from '../lib/useSession';
import { COLORS, FONT_FAMILY, getLoyaltyLevel, LOYALTY_LEVELS } from '@lets-night/shared';
import MilestoneCard from '../components/MilestoneCard';
import EmptyState from '../components/EmptyState';

const REWARDS = [
  { id: 'r1', titleKey: 'loyaltyScreen.r1', cost: 200 },
  { id: 'r2', titleKey: 'loyaltyScreen.r2', cost: 300 },
  { id: 'r3', titleKey: 'loyaltyScreen.r3', cost: 500 },
  { id: 'r4', titleKey: 'loyaltyScreen.r4', cost: 800 },
  { id: 'r5', titleKey: 'loyaltyScreen.r5', cost: 1500 },
];

function Section({ title, children, action }) {
  return (
    <View style={{ marginBottom: 26 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, paddingHorizontal: 20 }}>
        <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 16, letterSpacing: -0.2 }}>{title}</Text>
        {action}
      </View>
      <View style={{ paddingHorizontal: 20 }}>{children}</View>
    </View>
  );
}

export default function LoyaltyScreen() {
  const { t, fmtDate } = useI18n();
  const { session } = useSession();
  const myId = session?.user?.id;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [points, setPoints] = useState(0);
  const [milestones, setMilestones] = useState([]);
  const [userMilestones, setUserMilestones] = useState({});
  const [history, setHistory] = useState([]);

  async function loadAll() {
    if (!myId) return;
    const [{ data: prof }, { data: cat }, { data: um }, { data: bk }] = await Promise.all([
      supabase.from('profiles').select('loyalty_points').eq('id', myId).maybeSingle(),
      supabase.from('loyalty_milestones').select('*').order('points'),
      supabase.from('user_milestones').select('*').eq('user_id', myId),
      supabase.from('bookings')
        .select('id, created_at, total_price, status, events(title)')
        .eq('user_id', myId)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(10),
    ]);
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
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <EmptyState
          title={t('loyaltyScreen.guestTitle')}
          subtitle={t('loyaltyScreen.guestSub')}
          actionLabel={t('auth.login')}
          onAction={() => router.push('/auth/login')}
        />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={COLORS.brand} size="large" />
      </View>
    );
  }

  const ll = getLoyaltyLevel(points);
  const unlocked = milestones.filter(m => userMilestones[m.id]?.unlocked_at);
  const available = milestones.filter(m => !userMilestones[m.id]?.unlocked_at);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.bg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}
    >
      {/* Wallet-style card */}
      <View style={{ padding: 20, paddingTop: 16 }}>
        <View style={{
          borderRadius: 18,
          overflow: 'hidden',
          backgroundColor: COLORS.bgElev1,
          borderWidth: 1,
          borderColor: COLORS.borderSubtle,
        }}>
          <View style={{ padding: 22, paddingBottom: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Text style={{
                color: COLORS.textMuted, fontSize: 10, letterSpacing: 2,
                textTransform: 'uppercase', fontWeight: '600',
              }}>
                Let&apos;s Night · Membership
              </Text>
              <Text style={{ color: ll.level.color, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>
                {ll.level.name.toUpperCase()}
              </Text>
            </View>

            <View style={{ marginTop: 28 }}>
              <Text style={{ fontFamily: FONT_FAMILY.displayHeavy, color: COLORS.textPrimary, fontSize: 38, letterSpacing: -1, lineHeight: 42 }}>
                {points.toLocaleString()}
              </Text>
              <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>{t('loyaltyScreen.totalPoints')}</Text>
            </View>

            <View style={{ marginTop: 22 }}>
              <View style={{
                height: 3, borderRadius: 2,
                backgroundColor: COLORS.borderSubtle,
                overflow: 'hidden',
              }}>
                <View style={{
                  width: `${Math.round(ll.progress * 100)}%`,
                  height: '100%',
                  backgroundColor: ll.level.color,
                }} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                <Text style={{ color: COLORS.textMuted, fontSize: 11 }}>
                  {ll.next ? t('loyaltyScreen.nextLevel', { level: ll.next.name }) : t('loyaltyScreen.maxLevel')}
                </Text>
                {ll.next && (
                  <Text style={{ color: COLORS.textSecondary, fontSize: 11, fontWeight: '600' }}>
                    {t('loyaltyScreen.pointsShort', { count: ll.pointsToNext })}
                  </Text>
                )}
              </View>
            </View>
          </View>

          {/* Ladder testuale, no emoji */}
          <View style={{
            flexDirection: 'row',
            borderTopWidth: 1,
            borderTopColor: COLORS.borderSubtle,
          }}>
            {LOYALTY_LEVELS.map((l, idx) => {
              const reached = points >= l.threshold;
              const isCurrent = l.name === ll.level.name;
              return (
                <View key={l.name} style={{
                  flex: 1, paddingVertical: 14,
                  borderLeftWidth: idx > 0 ? 1 : 0,
                  borderLeftColor: COLORS.borderSubtle,
                  alignItems: 'center',
                  backgroundColor: isCurrent ? COLORS.brandSubtle : 'transparent',
                }}>
                  <Text style={{
                    color: reached ? l.color : COLORS.textDisabled,
                    fontSize: 11, fontWeight: isCurrent ? '700' : '500',
                    letterSpacing: 0.3,
                  }}>
                    {l.name}
                  </Text>
                  <Text style={{ color: COLORS.textDisabled, fontSize: 10, marginTop: 3 }}>{l.threshold}</Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>

      {/* Stats minimal */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginBottom: 26 }}>
        <StatMini label={t('loyaltyScreen.statUnlocked')} value={unlocked.length} />
        <StatMini label={t('loyaltyScreen.statTotal')} value={milestones.length} />
        <StatMini label={t('loyaltyScreen.statNights')} value={history.length} />
      </View>

      {unlocked.length > 0 && (
        <Section title={`Sbloccati (${unlocked.length})`}>
          {unlocked.map(m => (
            <MilestoneCard key={m.id} milestone={m} unlocked progress={userMilestones[m.id]?.progress || m.goal} />
          ))}
        </Section>
      )}

      {available.length > 0 && (
        <Section title={t('loyaltyScreen.sectionMilestones')}>
          {available.map(m => (
            <MilestoneCard key={m.id} milestone={m} unlocked={false} progress={userMilestones[m.id]?.progress || 0} />
          ))}
        </Section>
      )}

      <Section title={t('loyaltyScreen.sectionRewards')}>
        {REWARDS.map(r => {
          const canRedeem = points >= r.cost;
          return (
            <View key={r.id} style={{
              flexDirection: 'row', alignItems: 'center',
              paddingVertical: 14, paddingHorizontal: 16,
              backgroundColor: COLORS.bgElev2,
              borderRadius: 10, marginBottom: 8,
              borderWidth: 1, borderColor: COLORS.borderSubtle,
            }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: canRedeem ? COLORS.textPrimary : COLORS.textSecondary, fontSize: 13, fontWeight: '600' }}>
                  {t(r.titleKey)}
                </Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 3 }}>{t('loyaltyScreen.pointsShort', { count: r.cost })}</Text>
              </View>
              <View style={{
                paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
                borderWidth: 1,
                borderColor: canRedeem ? COLORS.brandBorder : COLORS.borderStrong,
              }}>
                <Text style={{
                  color: canRedeem ? COLORS.brand : COLORS.textDisabled,
                  fontSize: 11, fontWeight: '600',
                }}>
                  {canRedeem ? t('loyaltyScreen.redeem') : t('loyaltyScreen.locked')}
                </Text>
              </View>
            </View>
          );
        })}
      </Section>

      <Section title={t('loyaltyScreen.sectionHistory')}>
        {history.length === 0 ? (
          <Text style={{ color: COLORS.textMuted, fontSize: 12, textAlign: 'center', paddingVertical: 16 }}>
            {t('loyaltyScreen.emptyHistory')}
          </Text>
        ) : history.map(b => (
          <View key={b.id} style={{
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            paddingVertical: 12, paddingHorizontal: 16,
            backgroundColor: COLORS.bgElev2, borderRadius: 10, marginBottom: 6,
            borderWidth: 1, borderColor: COLORS.borderSubtle,
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.textPrimary, fontSize: 13, fontWeight: '500' }} numberOfLines={1}>
                {b.events?.title || t('loyaltyScreen.bookingFallback')}
              </Text>
              <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 2 }}>
                {fmtDate(b.created_at?.split('T')[0])}
              </Text>
            </View>
            <Text style={{ color: COLORS.brand, fontWeight: '600', fontSize: 13 }}>+50</Text>
          </View>
        ))}
      </Section>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

function StatMini({ label, value }) {
  return (
    <View style={{
      flex: 1, backgroundColor: COLORS.bgElev2,
      borderRadius: 10, padding: 14,
      borderWidth: 1, borderColor: COLORS.borderSubtle,
    }}>
      <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 20, letterSpacing: -0.3 }}>{value}</Text>
      <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 3 }}>{label}</Text>
    </View>
  );
}
