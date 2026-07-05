import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import { COLORS, FONT_FAMILY } from '@lets-night/shared';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';
import { useI18n } from '../../lib/i18n';

export default function DeleteAccountScreen() {
  const { t } = useI18n();
  const { session } = useSession();
  const myId = session?.user?.id;
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const confirmWord = t('settings.delConfirmWord');

  async function handleDelete() {
    if (confirm.trim().toLowerCase() !== confirmWord) return;
    if (!myId) {
      Alert.alert(t('settings.delSessionExpiredTitle'), t('settings.delSessionExpiredBody'));
      return;
    }
    Alert.alert(
      t('settings.delConfirmTitle'),
      t('settings.delConfirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            const results = await Promise.all([
              supabase.from('profiles').update({
                full_name: 'Utente eliminato',
                display_name: null,
                username: null,
                bio: null,
                avatar_url: null,
                phone: null,
                interests: [],
                city: null,
                birth_date: null,
                push_token: null,
              }).eq('id', myId),
              supabase.from('bookings').delete().eq('user_id', myId),
              supabase.from('follows').delete().eq('follower_id', myId),
              supabase.from('follows').delete().eq('following_id', myId),
              supabase.from('favorite_venues').delete().eq('user_id', myId),
            ]);
            const failed = results.find(r => r.error);
            if (failed) {
              setLoading(false);
              Alert.alert(t('common.error'), t('settings.delError'));
              console.error('Errore soft delete:', failed.error);
              return;
            }
            await supabase.auth.signOut();
            setLoading(false);
            router.replace('/(tabs)/profile');
          },
        },
      ]
    );
  }

  const canDelete = confirm.trim().toLowerCase() === confirmWord;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: COLORS.bg }} contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
      <Text style={{ color: COLORS.danger, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
        {t('settings.delEyebrow')}
      </Text>
      <Text style={{ fontFamily: FONT_FAMILY.displayHeavy, color: COLORS.textPrimary, fontSize: 24, marginBottom: 16 }}>
        {t('settings.deleteAccount')}
      </Text>

      <View style={{ backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)', borderRadius: 14, padding: 16, marginBottom: 28 }}>
        <Text style={{ color: COLORS.danger, fontWeight: '700', fontSize: 14, marginBottom: 8 }}>
          {t('settings.delWhatHappens')}
        </Text>
        {[
          t('settings.delBullet1'),
          t('settings.delBullet2'),
          t('settings.delBullet3'),
          t('settings.delBullet4'),
        ].map((row, i) => (
          <Text key={i} style={{ color: '#FCA5A5', fontSize: 13, marginBottom: 4 }}>
            · {row}
          </Text>
        ))}
      </View>

      <Text style={{ color: COLORS.textSecondary, fontSize: 14, marginBottom: 18 }}>
        {t('settings.delConfirmPrompt1')} <Text style={{ color: COLORS.textPrimary, fontWeight: '700' }}>{confirmWord}</Text> {t('settings.delConfirmPrompt2')}
      </Text>

      <TextInput
        value={confirm}
        onChangeText={setConfirm}
        placeholder={confirmWord}
        placeholderTextColor={COLORS.textDisabled}
        autoCapitalize="none"
        style={{
          backgroundColor: COLORS.bgElev3, borderWidth: 1,
          borderColor: canDelete ? 'rgba(239,68,68,0.5)' : COLORS.borderStrong,
          borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
          color: COLORS.textPrimary, fontSize: 14, marginBottom: 20,
        }}
      />

      <Pressable
        onPress={handleDelete}
        disabled={!canDelete || loading}
        style={({ pressed }) => ({
          backgroundColor: canDelete ? '#DC2626' : COLORS.bgElev3,
          borderRadius: 12, paddingVertical: 14, alignItems: 'center',
          opacity: (!canDelete || loading || pressed) ? 0.6 : 1,
        })}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{t('settings.delForever')}</Text>
        }
      </Pressable>

      <Pressable onPress={() => router.back()} style={{ marginTop: 16, alignItems: 'center' }}>
        <Text style={{ color: COLORS.textMuted, fontSize: 14 }}>{t('common.cancel')}</Text>
      </Pressable>
    </ScrollView>
  );
}
