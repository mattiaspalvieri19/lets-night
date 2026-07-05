import { View, Text, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LANGS, COLORS } from '@lets-night/shared';
import { useI18n } from '../../lib/i18n';

export default function LanguageScreen() {
  const { t, lang, setLang } = useI18n();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: COLORS.bg }} contentContainerStyle={{ padding: 20 }}>
      <Text style={{ color: COLORS.textMuted, fontSize: 13, marginBottom: 16 }}>{t('settings.languageSub')}</Text>
      <View style={{ backgroundColor: COLORS.bgElev2, borderRadius: 14, overflow: 'hidden' }}>
        {LANGS.map((l, i) => {
          const active = lang === l.code;
          return (
            <Pressable
              key={l.code}
              onPress={() => setLang(l.code)}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center',
                paddingHorizontal: 16, paddingVertical: 15,
                borderTopWidth: i === 0 ? 0 : 1, borderTopColor: COLORS.borderSubtle,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ flex: 1, color: COLORS.textPrimary, fontSize: 15, fontWeight: active ? '700' : '400' }}>
                {l.label}
              </Text>
              {active && <Ionicons name="checkmark" size={20} color={COLORS.brand} />}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
