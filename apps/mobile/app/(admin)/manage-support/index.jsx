import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { COLORS, FONT_FAMILY } from '@lets-night/shared';

const CAT_LABELS = {
  booking: 'Prenotazione', payment: 'Pagamento/Rimborso', account: 'Accesso/Account',
  event: 'Evento/Locale', bug: 'Bug app', other: 'Altro',
};
const STATUS_LABELS = {
  open: 'Aperto', in_progress: 'In lavorazione', waiting_user: 'In attesa utente',
  resolved: 'Risolto', closed: 'Chiuso',
};
const STATUS_COLOR = {
  open: COLORS.brand, in_progress: COLORS.warning, waiting_user: COLORS.success,
  resolved: COLORS.textSecondary, closed: COLORS.textMuted,
};
const STATUS_FILTERS = [[null, 'Tutti'], ['open', 'Aperti'], ['in_progress', 'In lavorazione'], ['waiting_user', 'In attesa utente'], ['resolved', 'Risolti'], ['closed', 'Chiusi']];

function fmt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }) + ' · ' +
    String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

export default function AdminSupportList() {
  const [tickets, setTickets] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    let q = supabase
      .from('support_tickets')
      .select('id, subject, category, status, updated_at, profiles(full_name), events(title)')
      .order('updated_at', { ascending: false });
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) console.error('Errore ticket admin:', error);
    setTickets(data || []);
  }, [status]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  function goBack() {
    if (router.canGoBack()) router.back(); else router.replace('/(admin)');
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 10, flexDirection: 'row', alignItems: 'center' }}>
        <Pressable onPress={goBack} hitSlop={10}>
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </View>
        </Pressable>
        <Text style={{ flex: 1, fontFamily: FONT_FAMILY.display, color: '#fff', fontSize: 17, marginLeft: 12 }}>Assistenza</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 6, paddingBottom: 8 }} style={{ flexGrow: 0 }}>
        {STATUS_FILTERS.map(([val, label]) => {
          const active = status === val;
          return (
            <Pressable key={val || 'all'} onPress={() => setStatus(val)}
              style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, backgroundColor: active ? COLORS.textPrimary : 'transparent', borderWidth: 1, borderColor: active ? COLORS.textPrimary : COLORS.borderSubtle }}>
              <Text style={{ color: active ? COLORS.bg : COLORS.textSecondary, fontSize: 12, fontWeight: active ? '700' : '500' }}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={COLORS.brand} size="large" />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingTop: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}
        >
          {tickets.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, backgroundColor: COLORS.bgElev2, borderRadius: 10, borderWidth: 1, borderColor: COLORS.borderSubtle }}>
              <Ionicons name="chatbubbles-outline" size={30} color={COLORS.textMuted} style={{ marginBottom: 10 }} />
              <Text style={{ color: COLORS.textSecondary, fontSize: 14, textAlign: 'center' }}>Nessun ticket per questo filtro.</Text>
            </View>
          ) : tickets.map(tk => {
            const color = STATUS_COLOR[tk.status] || COLORS.textSecondary;
            return (
              <Pressable
                key={tk.id}
                onPress={() => router.push(`/(admin)/manage-support/${tk.id}`)}
                style={({ pressed }) => ({
                  backgroundColor: COLORS.bgElev2, borderRadius: 14, padding: 16, marginBottom: 12,
                  borderWidth: 1, borderColor: COLORS.borderSubtle, opacity: pressed ? 0.85 : 1,
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <Text style={{ flex: 1, color: COLORS.brand, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase' }} numberOfLines={1}>
                    {CAT_LABELS[tk.category] || tk.category}
                  </Text>
                  <View style={{ backgroundColor: `${color}22`, borderWidth: 1, borderColor: `${color}55`, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 }}>
                    <Text style={{ color, fontSize: 11, fontWeight: '800' }}>{STATUS_LABELS[tk.status] || tk.status}</Text>
                  </View>
                </View>
                <Text style={{ fontFamily: FONT_FAMILY.display, color: '#fff', fontSize: 15, marginBottom: 6 }} numberOfLines={2}>{tk.subject}</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>
                  {tk.profiles?.full_name || 'Utente'}{tk.events?.title ? ` · ${tk.events.title}` : ''} · {fmt(tk.updated_at)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
