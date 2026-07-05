import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, TextInput } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { API_URL } from '../../lib/apiUrl';
import { COLORS, FONT_FAMILY } from '@lets-night/shared';

const PAGE_SIZE = 50;

export default function AdminUsers() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState({});

  async function loadData(term = search, currentLimit = limit) {
    // Solo clienti: niente business, e nemmeno gli account admin (lista via
    // RPC perché il self-read su admins non permette di enumerarli dal client).
    const { data: adminRows } = await supabase.rpc('admin_list_admin_ids');
    const adminIds = (adminRows || [])
      .map(r => (typeof r === 'string' ? r : r?.admin_list_admin_ids))
      .filter(Boolean);
    let q = supabase
      .from('profiles')
      .select('id, display_name, full_name, username, phone, city, loyalty_points')
      .or('role.eq.user,role.is.null')
      .order('full_name', { ascending: true })
      .limit(currentLimit);
    if (adminIds.length) q = q.not('id', 'in', `(${adminIds.map(a => `"${a}"`).join(',')})`);
    const s = term.trim();
    if (s) q = q.or(`full_name.ilike.%${s}%,username.ilike.%${s}%,phone.ilike.%${s}%`);
    const { data, error } = await q;
    if (error) console.error('Errore utenti admin:', error);
    setProfiles(data || []);
    setLoading(false);
  }

  useFocusEffect(useCallback(() => { loadData(); }, []));
  const onRefresh = useCallback(async () => { setRefreshing(true); await loadData(); setRefreshing(false); }, [search, limit]);

  function onSearch(v) {
    setSearch(v);
    loadData(v, limit);
  }

  async function loadMore() {
    const next = limit + PAGE_SIZE;
    setLimit(next);
    await loadData(search, next);
  }

  async function openDetail(p) {
    if (expanded === p.id) { setExpanded(null); return; }
    setExpanded(p.id);
    if (detail[p.id]) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    let info = null;
    try {
      const res = await fetch(`${API_URL}/api/admin/user-info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: p.id, accessToken: session.access_token }),
      });
      if (res.ok) info = await res.json();
    } catch {}

    const { data: bks } = await supabase
      .from('bookings')
      .select('id, status, checked_in, total_price, created_at, events(title, event_date)')
      .eq('user_id', p.id)
      .order('created_at', { ascending: false })
      .limit(15);

    setDetail(prev => ({ ...prev, [p.id]: { info, bookings: bks || [] } }));
  }

  if (loading) return <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={COLORS.brand} size="large" /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12 }}>
        <Text style={{ color: COLORS.danger, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', fontWeight: '600', marginBottom: 4 }}>Admin</Text>
        <Text style={{ fontFamily: FONT_FAMILY.display, color: '#fff', fontSize: 22, letterSpacing: -0.3 }}>Utenti</Text>

        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: COLORS.bgElev3, borderRadius: 8,
          borderWidth: 1, borderColor: COLORS.borderSubtle,
          paddingHorizontal: 12, paddingVertical: 8, marginTop: 14,
        }}>
          <TextInput
            value={search} onChangeText={onSearch}
            placeholder="Cerca per nome, username o telefono..."
            placeholderTextColor={COLORS.textDisabled}
            style={{ flex: 1, color: '#fff', fontSize: 13, paddingVertical: 0 }}
          />
          {search.length > 0 && (
            <Pressable onPress={() => onSearch('')} hitSlop={10}>
              <Text style={{ color: COLORS.textMuted, fontSize: 16 }}>×</Text>
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}
      >
        {profiles.length === 0 ? (
          <View style={{ backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 20, alignItems: 'center' }}>
            <Text style={{ color: COLORS.textSecondary, fontSize: 13 }}>Nessun utente trovato.</Text>
          </View>
        ) : profiles.map(p => {
          const isOpen = expanded === p.id;
          const d = detail[p.id];
          return (
            <Pressable key={p.id} onPress={() => openDetail(p)}
              style={{ backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 14, marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }} numberOfLines={1}>
                    {p.display_name || p.full_name || 'Senza nome'}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                    {p.username ? <Text style={{ color: COLORS.textMuted, fontSize: 11 }}>@{p.username}</Text> : null}
                    {p.city ? <Text style={{ color: COLORS.textMuted, fontSize: 11 }}>{p.city}</Text> : null}
                    <Text style={{ color: COLORS.textMuted, fontSize: 11 }}>{p.loyalty_points || 0} punti</Text>
                  </View>
                </View>
                <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>{isOpen ? '▲' : '▼'}</Text>
              </View>

              {isOpen && (
                <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.borderSubtle }}>
                  {!d ? (
                    <ActivityIndicator size="small" color={COLORS.brand} />
                  ) : (
                    <>
                      {d.info ? (
                        <Text style={{ color: COLORS.textSecondary, fontSize: 12, lineHeight: 18, marginBottom: 10 }} selectable>
                          {d.info.email}
                          {'\n'}Registrato: {d.info.created_at ? new Date(d.info.created_at).toLocaleDateString('it-IT') : '-'}
                          {' · '}Ultimo accesso: {d.info.last_sign_in_at ? new Date(d.info.last_sign_in_at).toLocaleString('it-IT') : '-'}
                          {'\n'}{d.info.email_confirmed_at ? 'Email confermata' : 'Email NON confermata'}
                        </Text>
                      ) : (
                        <Text style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 10 }}>Dati account non disponibili.</Text>
                      )}
                      <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6 }}>
                        Ultime prenotazioni ({d.bookings.length})
                      </Text>
                      {d.bookings.length === 0 ? (
                        <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>Nessuna prenotazione.</Text>
                      ) : d.bookings.map(b => (
                        <View key={b.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 }}>
                          <Text style={{ color: COLORS.textSecondary, fontSize: 12, flex: 1, marginRight: 8 }} numberOfLines={1}>
                            {b.events?.title || 'Evento'} · {b.events?.event_date || '-'}
                          </Text>
                          <Text style={{ color: b.checked_in ? COLORS.success : COLORS.textMuted, fontSize: 12 }}>
                            € {(Number(b.total_price) || 0).toFixed(0)} · {b.checked_in ? 'entrato' : b.status}
                          </Text>
                        </View>
                      ))}
                    </>
                  )}
                </View>
              )}
            </Pressable>
          );
        })}

        {profiles.length >= limit && (
          <Pressable onPress={loadMore}
            style={{ borderWidth: 1, borderColor: COLORS.borderSubtle, borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 4 }}>
            <Text style={{ color: COLORS.textSecondary, fontSize: 13 }}>Carica altri</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}
