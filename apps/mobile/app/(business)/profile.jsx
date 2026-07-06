import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY, LANGS } from '@lets-night/shared';
import { useI18n } from '../../lib/i18n';

export default function BusinessProfile() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [venue, setVenue] = useState(null);
  const [user, setUser] = useState(null);

  useFocusEffect(useCallback(() => {
    async function load() {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/auth/login'); return; }
      setUser(session.user);
      const { data: v } = await supabase.from('venues').select('*').eq('owner_id', session.user.id).maybeSingle();
      setVenue(v);
      setLoading(false);
    }
    load();
  }, []));

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/auth/login');
  }

  if (loading) return <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={COLORS.brand} size="large" /></View>;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: COLORS.bg }} showsVerticalScrollIndicator={false}>
      <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 24 }}>
        <Text style={{ color: COLORS.brand, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>{t('biz.yourVenue')}</Text>
        <Text style={{ fontFamily: FONT_FAMILY.displayHeavy, color: '#fff', fontSize: 24 }}>{venue?.name || t('common.venue')}</Text>
      </View>

      {/* Stato verifica */}
      <View style={{ marginHorizontal: 20, marginBottom: 20, backgroundColor: venue?.is_verified ? 'rgba(74,222,128,0.1)' : 'rgba(245,158,11,0.1)', borderWidth: 1, borderColor: venue?.is_verified ? 'rgba(74,222,128,0.3)' : 'rgba(245,158,11,0.3)', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Ionicons name={venue?.is_verified ? 'checkmark-circle' : 'time-outline'} size={24} color={venue?.is_verified ? COLORS.success : COLORS.warning} />
        <View>
          <Text style={{ color: venue?.is_verified ? COLORS.success : COLORS.warning, fontWeight: '700', fontSize: 14 }}>
            {venue?.is_verified ? t('biz.verified') : t('biz.pendingApproval')}
          </Text>
          <Text style={{ color: COLORS.textSecondary, fontSize: 12, marginTop: 2 }}>
            {venue?.is_verified ? t('biz.verifiedSub') : t('biz.pendingSub')}
          </Text>
        </View>
      </View>

      {/* Dati locale */}
      <View style={{ marginHorizontal: 20, marginBottom: 12, backgroundColor: COLORS.bgElev2, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: COLORS.borderSubtle }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <Text style={{ fontFamily: FONT_FAMILY.display, color: '#fff', fontSize: 15 }}>{t('biz.venueData')}</Text>
          <Pressable onPress={() => router.push('/(business)/venue/edit')} hitSlop={6}>
            <Text style={{ color: COLORS.brand, fontWeight: '700', fontSize: 13 }}>{t('common.edit')}</Text>
          </Pressable>
        </View>
        {[
          [t('biz.category'), venue?.category],
          [t('biz.city'), venue?.city],
          [t('biz.zone'), venue?.zona],
          [t('biz.address'), venue?.address],
          [t('biz.phone'), venue?.phone],
        ].filter(([, v]) => v).map(([label, value]) => (
          <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.borderSubtle }}>
            <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>{label}</Text>
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '500', maxWidth: '60%', textAlign: 'right' }}>{value}</Text>
          </View>
        ))}
      </View>

      <Pressable
        onPress={() => router.push('/(business)/venue/edit')}
        style={({ pressed }) => ({ marginHorizontal: 20, marginBottom: 20, backgroundColor: COLORS.brandStrong, borderRadius: 14, paddingVertical: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, opacity: pressed ? 0.85 : 1 })}
      >
        <Ionicons name="create-outline" size={16} color="#fff" />
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{t('biz.editVenue')}</Text>
      </Pressable>

      {/* Dati account */}
      <View style={{ marginHorizontal: 20, marginBottom: 32, backgroundColor: COLORS.bgElev2, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: COLORS.borderSubtle }}>
        <Text style={{ fontFamily: FONT_FAMILY.display, color: '#fff', fontSize: 15, marginBottom: 14 }}>{t('biz.account')}</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
          <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>Email</Text>
          <Text style={{ color: '#fff', fontSize: 12, maxWidth: '65%', textAlign: 'right' }}>{user?.email}</Text>
        </View>
      </View>

      {/* Lingua app */}
      <LanguageRow />

      {/* Dashboard web */}
      <View style={{ marginHorizontal: 20, marginBottom: 16, backgroundColor: COLORS.bgElev2, borderWidth: 1, borderColor: COLORS.borderSubtle, borderRadius: 14, padding: 16 }}>
        <Text style={{ color: COLORS.brand, fontWeight: '700', fontSize: 14, marginBottom: 4 }}>{t('biz.webDashboard')}</Text>
        <Text style={{ color: COLORS.textMuted, fontSize: 12, lineHeight: 18 }}>
          {t('biz.webDashboardSub')}
        </Text>
      </View>

      <Pressable onPress={handleLogout} style={({ pressed }) => ({ marginHorizontal: 20, marginBottom: 40, borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)', borderRadius: 14, paddingVertical: 16, alignItems: 'center', opacity: pressed ? 0.7 : 1 })}>
        <Text style={{ color: COLORS.danger, fontWeight: '700', fontSize: 15 }}>{t('biz.logoutBtn')}</Text>
      </Pressable>
    </ScrollView>
  );
}

function LanguageRow() {
  const { t, lang } = useI18n();
  return (
    <Pressable
      onPress={() => router.push('/settings/language')}
      style={({ pressed }) => ({
        marginHorizontal: 20, marginBottom: 16, backgroundColor: COLORS.bgElev2,
        borderWidth: 1, borderColor: COLORS.borderSubtle, borderRadius: 14, padding: 16,
        flexDirection: 'row', alignItems: 'center', opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name="language-outline" size={18} color={COLORS.brand} style={{ marginRight: 12 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>{t('settings.language')}</Text>
        <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>{LANGS.find(l => l.code === lang)?.label}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={COLORS.textDisabled} />
    </Pressable>
  );
}
