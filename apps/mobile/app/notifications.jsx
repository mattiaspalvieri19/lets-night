import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/useSession';
import { COLORS, FONT_FAMILY } from '@lets-night/shared';

const META = {
  booking_confirmed: { icon: 'ticket-outline',   color: COLORS.success },
  follow:            { icon: 'person-add-outline', color: COLORS.brand },
  friend_booking:    { icon: 'people-outline',    color: COLORS.warning },
  reminder:          { icon: 'alarm-outline',     color: COLORS.brand },
  generic:           { icon: 'notifications-outline', color: COLORS.textSecondary },
};

function relativeTime(iso) {
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'ora';
  const m = Math.floor(s / 60); if (m < 60) return `${m} min fa`;
  const h = Math.floor(m / 60); if (h < 24) return `${h} h fa`;
  const g = Math.floor(h / 24); if (g < 7) return `${g} g fa`;
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { session } = useSession();
  const myId = session?.user?.id;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    if (!myId) { setLoading(false); return; }
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', myId)
      .order('created_at', { ascending: false })
      .limit(80);
    setItems(data || []);
    // Segna lette (così il badge in Home si azzera). Non rifacciamo il fetch: la vista
    // mantiene l'evidenziazione delle nuove per questa sessione di lettura.
    if ((data || []).some(n => !n.read)) {
      supabase.from('notifications').update({ read: true }).eq('user_id', myId).eq('read', false).then(() => {});
    }
  }

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [myId]);

  function navigate(n) {
    // Per tipo: follower → profilo (per contraccambiare); prenotazione → il TUO biglietto
    // (QR); amico-prenota/promemoria → pagina evento (per prenotare anche tu).
    if (n.type === 'follow' && n.actor_id) router.push(`/user/${n.actor_id}`);
    else if (n.type === 'booking_confirmed' && n.booking_id) router.push(`/ticket/${n.booking_id}`);
    else if (n.event_id) router.push(`/event/${n.event_id}`);
    else if (n.actor_id) router.push(`/user/${n.actor_id}`);
  }

  if (!myId) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
        <Ionicons name="notifications-outline" size={40} color={COLORS.textMuted} style={{ marginBottom: 12 }} />
        <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 18, marginBottom: 8, textAlign: 'center' }}>Accedi per le notifiche</Text>
        <Text style={{ color: COLORS.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 21, marginBottom: 22 }}>
          Prenotazioni, nuovi follower e serate degli amici in un posto solo.
        </Text>
        <Pressable onPress={() => router.push('/auth/login')} style={{ backgroundColor: COLORS.brandStrong, paddingHorizontal: 26, paddingVertical: 13, borderRadius: 12 }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Accedi</Text>
        </Pressable>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={COLORS.brand} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      {items.length === 0 ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}
        >
          <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: COLORS.bgElev2, alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
            <Ionicons name="notifications-outline" size={32} color={COLORS.textSecondary} />
          </View>
          <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 18, marginBottom: 8 }}>Nessuna notifica</Text>
          <Text style={{ color: COLORS.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 21 }}>
            Qui arrivano le conferme di prenotazione, i nuovi follower e le serate dei tuoi amici.
          </Text>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}
        >
          {items.map(n => {
            const meta = META[n.type] || META.generic;
            return (
              <Pressable
                key={n.id}
                onPress={() => navigate(n)}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'flex-start', gap: 14,
                  paddingHorizontal: 20, paddingVertical: 14,
                  backgroundColor: n.read ? 'transparent' : 'rgba(124,58,237,0.06)',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: `${meta.color}1f`, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                  <Ionicons name={meta.icon} size={20} color={meta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.textPrimary, fontSize: 15, fontWeight: '700', marginBottom: 2 }}>{n.title}</Text>
                  {n.body ? <Text style={{ color: COLORS.textSecondary, fontSize: 13, lineHeight: 18 }}>{n.body}</Text> : null}
                  <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 4 }}>{relativeTime(n.created_at)}</Text>
                </View>
                {!n.read && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.brand, marginTop: 6 }} />}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
