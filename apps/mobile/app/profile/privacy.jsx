import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Switch } from 'react-native';
import { router } from 'expo-router';
import { COLORS, FONT_FAMILY } from '@lets-night/shared';
import { supabase } from '../../lib/supabase';
import { useI18n } from '../../lib/i18n';
import { useSession } from '../../lib/useSession';

const DEFAULT_PRIVACY = {
  searchable: true,
  profile_visibility: 'public',
  show_future_events: true,
  show_past_events: true,
  show_photos: true,
  show_badges: true,
  show_favorite_venues: true,
  show_followers: true,
  show_following: true,
  notify_followers_on_booking: false, // opt-in: di default non avvisa i follower
};

const TOGGLES = [
  { key: 'searchable',          labelKey: 'privacy.searchable', subKey: 'privacy.searchableSub' },
  { key: 'show_future_events',  labelKey: 'privacy.showFuture', subKey: 'privacy.showFutureSub' },
  { key: 'notify_followers_on_booking', labelKey: 'privacy.notifyFollowers', subKey: 'privacy.notifyFollowersSub' },
  { key: 'show_past_events',    labelKey: 'privacy.showPast', subKey: 'privacy.showPastSub' },
  { key: 'show_photos',         labelKey: 'privacy.showPhotos', subKey: 'privacy.showPhotosSub' },
  { key: 'show_badges',         labelKey: 'privacy.showBadges', subKey: 'privacy.showBadgesSub' },
  { key: 'show_favorite_venues',labelKey: 'privacy.showFavVenues', subKey: null },
  { key: 'show_followers',      labelKey: 'privacy.showFollowers', subKey: null },
  { key: 'show_following',      labelKey: 'privacy.showFollowing', subKey: null },
];

export default function PrivacyScreen() {
  const { t } = useI18n();
  const { session } = useSession();
  const myId = session?.user?.id;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_PRIVACY);

  useEffect(() => {
    async function load() {
      if (!myId) { setLoading(false); return; }
      const { data } = await supabase
        .from('profiles').select('privacy_settings')
        .eq('id', myId).maybeSingle();
      if (data?.privacy_settings) {
        setSettings({ ...DEFAULT_PRIVACY, ...data.privacy_settings });
      }
      setLoading(false);
    }
    load();
  }, [myId]);

  async function persist(next) {
    setSettings(next);
    setSaving(true);
    await supabase.from('profiles').update({ privacy_settings: next }).eq('id', myId);
    setSaving(false);
  }

  function toggle(key) {
    const next = { ...settings, [key]: !settings[key] };
    persist(next);
  }

  function setVisibility(value) {
    persist({ ...settings, profile_visibility: value });
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={COLORS.brand} size="large" />
      </View>
    );
  }

  if (!myId) return null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: COLORS.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={{ padding: 20, paddingTop: 24 }}>
        <Text style={{ color: COLORS.brand, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>{t('privacy.eyebrow')}</Text>
        <Text style={{ fontFamily: FONT_FAMILY.displayHeavy, color: COLORS.textPrimary, fontSize: 24, marginBottom: 6 }}>{t('privacy.title')}</Text>
        <Text style={{ color: COLORS.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 22 }}>
          Scegli cosa rendere visibile agli altri utenti.
        </Text>

        {/* Profile visibility */}
        <View style={{ marginBottom: 28 }}>
          <Text style={{ color: COLORS.textMuted, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>
            {t('privacy.visibility')}
          </Text>
          {[
            { id: 'public',  label: t('privacy.visPublic'),  desc: t('privacy.visPublicDesc') },
            { id: 'followers', label: t('privacy.visFollowers'), desc: t('privacy.visFollowersDesc') },
            { id: 'private', label: t('privacy.visPrivate'), desc: t('privacy.visPrivateDesc') },
          ].map(opt => {
            const active = settings.profile_visibility === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => setVisibility(opt.id)}
                style={{
                  flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                  paddingHorizontal: 14, paddingVertical: 14, borderRadius: 12,
                  marginBottom: 8,
                  backgroundColor: active ? COLORS.brandSubtle : COLORS.bgElev2,
                  borderWidth: 1, borderColor: active ? COLORS.brandStrong : COLORS.borderSubtle,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.textPrimary, fontWeight: '700', fontSize: 14 }}>{opt.label}</Text>
                  <Text style={{ color: COLORS.textSecondary, fontSize: 12, marginTop: 2 }}>{opt.desc}</Text>
                </View>
                <View style={{
                  width: 20, height: 20, borderRadius: 10,
                  borderWidth: 2, borderColor: active ? COLORS.brandStrong : COLORS.borderStrong,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {active && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.brandStrong }} />}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Toggle list */}
        <Text style={{ color: COLORS.textMuted, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>
          {t('privacy.whatVisible')}
        </Text>
        {TOGGLES.map(tg => (
          <View
            key={tg.key}
            style={{
              flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
              paddingHorizontal: 14, paddingVertical: 14, borderRadius: 12,
              backgroundColor: COLORS.bgElev2,
              borderWidth: 1, borderColor: COLORS.borderSubtle,
              marginBottom: 8,
            }}
          >
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={{ color: COLORS.textPrimary, fontWeight: '600', fontSize: 14 }}>{t(tg.labelKey)}</Text>
              {tg.subKey && <Text style={{ color: COLORS.textSecondary, fontSize: 11, marginTop: 2, lineHeight: 16 }}>{t(tg.subKey)}</Text>}
            </View>
            <Switch
              value={!!settings[tg.key]}
              onValueChange={() => toggle(tg.key)}
              trackColor={{ false: COLORS.bgElev3, true: COLORS.brandStrong }}
              thumbColor={settings[t.key] ? '#fff' : COLORS.textSecondary}
            />
          </View>
        ))}

        <Text style={{ color: COLORS.textMuted, fontSize: 11, textAlign: 'center', marginTop: 20, lineHeight: 17 }}>
          Email e telefono restano sempre privati.{'\n'}I dati di prenotazione non sono mai pubblici.
        </Text>

        {saving && (
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 14 }}>
            <ActivityIndicator color={COLORS.brand} size="small" />
            <Text style={{ color: COLORS.brand, fontSize: 12 }}>{t('common.saving')}</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
