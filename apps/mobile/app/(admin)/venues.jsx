import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { COLORS, FONT_FAMILY } from '@lets-night/shared';

export default function AdminVenues() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [venues, setVenues] = useState([]);
  const [eventCounts, setEventCounts] = useState({});
  const [busy, setBusy] = useState(null);

  async function loadData() {
    const { data, error } = await supabase.from('venues').select('*').order('created_at', { ascending: false });
    if (error) console.error('Errore venues admin:', error);
    setVenues(data || []);
    setLoading(false);

    const { data: evs } = await supabase.from('events').select('venue_id');
    if (evs) {
      const counts = {};
      for (const e of evs) counts[e.venue_id] = (counts[e.venue_id] || 0) + 1;
      setEventCounts(counts);
    }
  }

  useFocusEffect(useCallback(() => { loadData(); }, []));
  const onRefresh = useCallback(async () => { setRefreshing(true); await loadData(); setRefreshing(false); }, []);

  async function approveVenue(venueId) {
    setBusy(venueId);
    const { error } = await supabase.from('venues').update({ is_verified: true }).eq('id', venueId);
    setBusy(null);
    if (error) { Alert.alert('Errore', error.message); return; }
    loadData();
  }

  function rejectVenue(venue) {
    Alert.alert(
      'Eliminare il locale?',
      `"${venue.name}" verrà eliminato definitivamente. L'azione è irreversibile.`,
      [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Elimina', style: 'destructive', onPress: async () => {
          setBusy(venue.id);
          const { error } = await supabase.from('venues').delete().eq('id', venue.id);
          setBusy(null);
          if (error) { Alert.alert('Errore', error.message); return; }
          loadData();
        } },
      ]
    );
  }

  async function unverifyVenue(venueId) {
    setBusy(venueId);
    await supabase.from('venues').update({ is_verified: false }).eq('id', venueId);
    setBusy(null);
    loadData();
  }

  if (loading) return <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={COLORS.brand} size="large" /></View>;

  const pending = venues.filter(v => !v.is_verified);
  const approved = venues.filter(v => v.is_verified);

  function VenueCard({ v, children }) {
    return (
      <View style={{ backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 14, marginBottom: 8 }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{v.name}</Text>
        <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
          {v.category} · {v.zona}, {v.city} · {eventCounts[v.id] || 0} eventi
        </Text>
        {(v.contact_email || v.phone) ? (
          <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }} selectable>
            {[v.contact_email, v.phone].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
        {v.description ? (
          <Text style={{ color: COLORS.textSecondary, fontSize: 12, marginTop: 4 }} numberOfLines={3}>{v.description}</Text>
        ) : null}
        {children}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12 }}>
        <Text style={{ color: COLORS.danger, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', fontWeight: '600', marginBottom: 4 }}>Admin</Text>
        <Text style={{ fontFamily: FONT_FAMILY.display, color: '#fff', fontSize: 22, letterSpacing: -0.3 }}>Locali</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}
      >
        <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>
          In attesa di approvazione ({pending.length})
        </Text>
        {pending.length === 0 ? (
          <View style={{ backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 16, marginBottom: 20 }}>
            <Text style={{ color: COLORS.textSecondary, fontSize: 13 }}>Nessun locale in attesa.</Text>
          </View>
        ) : pending.map(v => (
          <VenueCard key={v.id} v={v}>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <Pressable onPress={() => approveVenue(v.id)} disabled={busy === v.id}
                style={{ flex: 1, backgroundColor: 'rgba(74,222,128,0.12)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.35)', borderRadius: 8, paddingVertical: 9, alignItems: 'center' }}>
                {busy === v.id ? <ActivityIndicator size="small" color={COLORS.success} /> : (
                  <Text style={{ color: COLORS.success, fontSize: 12, fontWeight: '700' }}>Approva</Text>
                )}
              </Pressable>
              <Pressable onPress={() => rejectVenue(v)} disabled={busy === v.id}
                style={{ flex: 1, backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: 8, paddingVertical: 9, alignItems: 'center' }}>
                <Text style={{ color: COLORS.danger, fontSize: 12, fontWeight: '700' }}>Rifiuta</Text>
              </Pressable>
            </View>
          </VenueCard>
        ))}

        <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 14, marginBottom: 10 }}>
          Locali approvati ({approved.length})
        </Text>
        {approved.length === 0 ? (
          <View style={{ backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 16 }}>
            <Text style={{ color: COLORS.textSecondary, fontSize: 13 }}>Nessun locale approvato ancora.</Text>
          </View>
        ) : approved.map(v => (
          <VenueCard key={v.id} v={v}>
            <Pressable onPress={() => unverifyVenue(v.id)} disabled={busy === v.id}
              style={{ alignSelf: 'flex-start', marginTop: 10, borderWidth: 1, borderColor: COLORS.borderSubtle, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 }}>
              {busy === v.id ? <ActivityIndicator size="small" color={COLORS.textSecondary} /> : (
                <Text style={{ color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' }}>Sospendi</Text>
              )}
            </Pressable>
          </VenueCard>
        ))}
      </ScrollView>
    </View>
  );
}
