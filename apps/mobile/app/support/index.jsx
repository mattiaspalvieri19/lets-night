import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';
import { useI18n } from '../../lib/i18n';
import { COLORS, FONT_FAMILY } from '@lets-night/shared';

const STATUS_COLOR = {
  open: COLORS.brand,
  in_progress: COLORS.warning,
  waiting_user: COLORS.success,
  resolved: COLORS.textSecondary,
  closed: COLORS.textMuted,
};

export default function SupportHubScreen() {
  const { t, lang, fmtDate } = useI18n();
  const router = useRouter();
  const { session, loading: loadingAuth } = useSession();
  const myId = session?.user?.id;

  const [faqs, setFaqs] = useState([]);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadFaq() {
    let { data } = await supabase
      .from('support_faq')
      .select('id, question, answer')
      .eq('lang', lang)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    // Fallback all'italiano se non c'è ancora traduzione nella lingua scelta.
    if ((!data || data.length === 0) && lang !== 'it') {
      const res = await supabase
        .from('support_faq')
        .select('id, question, answer')
        .eq('lang', 'it')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      data = res.data;
    }
    setFaqs(data || []);
  }

  async function loadTickets() {
    if (!myId) return;
    const { data } = await supabase
      .from('support_tickets')
      .select('id, subject, category, status, updated_at')
      .eq('user_id', myId)
      .order('updated_at', { ascending: false });
    setTickets(data || []);
  }

  useFocusEffect(useCallback(() => {
    if (loadingAuth) return;
    if (!myId) { router.replace('/auth/login'); return; }
    setLoading(true);
    Promise.all([loadFaq(), loadTickets()]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId, loadingAuth, lang]));

  const q = query.trim().toLowerCase();
  const filteredFaq = q
    ? faqs.filter(f => (f.question + ' ' + f.answer).toLowerCase().includes(q))
    : faqs;

  if (loadingAuth || (loading && faqs.length === 0 && tickets.length === 0)) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={COLORS.brand} />
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: COLORS.bg }} contentContainerStyle={{ paddingTop: 20, paddingBottom: 48 }}>
      <View style={{ paddingHorizontal: 20, marginBottom: 22 }}>
        <Text style={{ color: COLORS.brand, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
          {t('support.hubEyebrow')}
        </Text>
        <Text style={{ fontFamily: FONT_FAMILY.displayHeavy, color: COLORS.textPrimary, fontSize: 26 }}>
          {t('support.hubTitle')}
        </Text>
      </View>

      {/* FAQ */}
      <View style={{ paddingHorizontal: 20, marginBottom: 10 }}>
        <Text style={{ color: COLORS.textMuted, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>
          {t('support.faqTitle')}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.bgElev2, borderRadius: 12, borderWidth: 1, borderColor: COLORS.borderSubtle, paddingHorizontal: 12, marginBottom: 12 }}>
          <Ionicons name="search" size={16} color={COLORS.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('support.faqSearch')}
            placeholderTextColor={COLORS.textDisabled}
            style={{ flex: 1, color: COLORS.textPrimary, fontSize: 14, paddingVertical: 12 }}
          />
        </View>
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        {filteredFaq.length === 0 ? (
          <Text style={{ color: COLORS.textMuted, fontSize: 13, paddingVertical: 6, marginBottom: 6 }}>
            {t('support.faqEmpty')}
          </Text>
        ) : filteredFaq.map(f => {
          const open = expanded === f.id;
          return (
            <Pressable
              key={f.id}
              onPress={() => setExpanded(open ? null : f.id)}
              style={{ backgroundColor: COLORS.bgElev2, borderRadius: 12, borderWidth: 1, borderColor: COLORS.borderSubtle, padding: 14, marginBottom: 10 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ flex: 1, color: COLORS.textPrimary, fontSize: 14, fontWeight: '600' }}>{f.question}</Text>
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.textMuted} />
              </View>
              {open ? (
                <Text style={{ color: COLORS.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 10 }}>{f.answer}</Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {/* Apri un ticket */}
      <View style={{ paddingHorizontal: 20, marginTop: 22, marginBottom: 26 }}>
        <Pressable
          onPress={() => router.push('/support/new')}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            backgroundColor: COLORS.brandStrong, borderRadius: 12, paddingVertical: 15,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Ionicons name="add-circle-outline" size={18} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>{t('support.openTicket')}</Text>
        </Pressable>
      </View>

      {/* I miei ticket */}
      <View style={{ paddingHorizontal: 20 }}>
        <Text style={{ color: COLORS.textMuted, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>
          {t('support.myTickets')}
        </Text>
        {tickets.length === 0 ? (
          <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>{t('support.noTickets')}</Text>
        ) : tickets.map(tk => {
          const color = STATUS_COLOR[tk.status] || COLORS.textSecondary;
          return (
            <Pressable
              key={tk.id}
              onPress={() => router.push(`/support/${tk.id}`)}
              style={({ pressed }) => ({
                backgroundColor: COLORS.bgElev2, borderRadius: 12, borderWidth: 1, borderColor: COLORS.borderSubtle,
                padding: 14, marginBottom: 10, opacity: pressed ? 0.85 : 1,
              })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <Text style={{ flex: 1, color: COLORS.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' }} numberOfLines={1}>
                  {t('support.cat.' + tk.category)}
                </Text>
                <View style={{ backgroundColor: `${color}22`, borderWidth: 1, borderColor: `${color}55`, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 }}>
                  <Text style={{ color, fontSize: 11, fontWeight: '800' }}>{t('support.status.' + tk.status)}</Text>
                </View>
              </View>
              <Text style={{ color: COLORS.textPrimary, fontSize: 15, fontWeight: '600' }} numberOfLines={2}>{tk.subject}</Text>
              <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 6 }}>{fmtDate(tk.updated_at)}</Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
