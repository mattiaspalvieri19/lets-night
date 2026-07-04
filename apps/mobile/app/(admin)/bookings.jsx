import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, TextInput, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { API_URL } from '../../lib/apiUrl';
import { formatDate, COLORS, FONT_FAMILY } from '@lets-night/shared';

const PAGE_SIZE = 50;

const STATUS_LABELS = {
  confirmed: 'Confermata',
  cancelled: 'Annullata',
  denied: 'Negata/Rimborsata',
};

const FILTERS = [
  ['all', 'Tutte'],
  ['confirmed', 'Confermate'],
  ['checked', 'Entrati'],
  ['cancelled', 'Annullate'],
  ['denied', 'Negate'],
];

function euro(v) { return '€ ' + (Number(v) || 0).toFixed(2); }

export default function AdminBookings() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refundReqs, setRefundReqs] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [busy, setBusy] = useState(null);
  const [limit, setLimit] = useState(PAGE_SIZE);

  async function loadData(currentLimit = limit) {
    const [{ data: rr }, { data: bks, error }] = await Promise.all([
      supabase
        .from('bookings')
        .select('id, total_price, fee, snapshot_full_name, refund_requested_at, refund_request_reason, events(title, event_date)')
        .not('refund_requested_at', 'is', null)
        .not('status', 'in', '("cancelled","denied")')
        .order('refund_requested_at', { ascending: true }),
      supabase
        .from('bookings')
        .select('*, events(id, title, event_date, venues(name))')
        .order('created_at', { ascending: false })
        .limit(currentLimit),
    ]);
    if (error) console.error('Errore prenotazioni admin:', error);
    setRefundReqs(rr || []);
    setBookings(bks || []);
    setLoading(false);
  }

  useFocusEffect(useCallback(() => { loadData(); }, []));
  const onRefresh = useCallback(async () => { setRefreshing(true); await loadData(); setRefreshing(false); }, [limit]);

  async function loadMore() {
    const next = limit + PAGE_SIZE;
    setLimit(next);
    await loadData(next);
  }

  async function resolveRefund(bookingId, action) {
    const doIt = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setBusy(bookingId);
      try {
        const res = await fetch(`${API_URL}/api/refund/resolve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId, accessToken: session.access_token, action }),
        });
        const json = await res.json();
        if (!res.ok) { Alert.alert('Errore', json.error || 'Operazione non riuscita.'); return; }
        loadData();
      } catch {
        Alert.alert('Errore', 'Connessione al server non riuscita.');
      } finally {
        setBusy(null);
      }
    };
    if (action === 'approve') {
      Alert.alert(
        'Approvare il rimborso?',
        'Verrà rimborsato il prezzo del biglietto al netto delle commissioni; il locale incassa € 0.',
        [{ text: 'Annulla', style: 'cancel' }, { text: 'Approva', onPress: doIt }]
      );
    } else {
      doIt();
    }
  }

  async function toggleCheckIn(b) {
    setBusy(b.id);
    const patch = b.checked_in
      ? { checked_in: false }
      : { checked_in: true, checked_in_at: new Date().toISOString() };
    const { error } = await supabase.from('bookings').update(patch).eq('id', b.id);
    setBusy(null);
    if (error) { Alert.alert('Errore', error.message); return; }
    setBookings(prev => prev.map(x => x.id === b.id ? { ...x, checked_in: !b.checked_in } : x));
  }

  function cancelNoRefund(b) {
    Alert.alert(
      'Annullare senza rimborso?',
      b.table_id
        ? 'È una quota tavolo: il posto torna in raccolta sul tavolo. Il QR verrà invalidato.'
        : 'Il QR verrà invalidato. Nessun rimborso verrà emesso.',
      [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Conferma', style: 'destructive', onPress: async () => {
          setBusy(b.id);
          const { error } = await supabase.from('bookings')
            .update({ status: 'cancelled', qr_code: null })
            .eq('id', b.id);
          setBusy(null);
          if (error) { Alert.alert('Errore', error.message); return; }
          loadData();
        } },
      ]
    );
  }

  function denyAndRefund(b) {
    Alert.alert(
      'Negare e rimborsare?',
      'La prenotazione verrà negata e rimborsata via Stripe.',
      [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Conferma', style: 'destructive', onPress: async () => {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) return;
          setBusy(b.id);
          try {
            const res = await fetch(`${API_URL}/api/stripe/refund-booking`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ bookingId: b.id, accessToken: session.access_token, reason: 'Annullata dall\'amministrazione' }),
            });
            const json = await res.json();
            if (!res.ok) { Alert.alert('Errore', json.error || 'Operazione non riuscita.'); return; }
            loadData();
          } catch {
            Alert.alert('Errore', 'Connessione al server non riuscita.');
          } finally {
            setBusy(null);
          }
        } },
      ]
    );
  }

  const filtered = bookings.filter(b => {
    if (filter === 'confirmed' && b.status !== 'confirmed') return false;
    if (filter === 'checked' && !b.checked_in) return false;
    if (filter === 'cancelled' && b.status !== 'cancelled') return false;
    if (filter === 'denied' && b.status !== 'denied') return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${b.snapshot_full_name || ''} ${b.events?.title || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (loading) return <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={COLORS.brand} size="large" /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12 }}>
        <Text style={{ color: COLORS.danger, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', fontWeight: '600', marginBottom: 4 }}>Admin</Text>
        <Text style={{ fontFamily: FONT_FAMILY.display, color: '#fff', fontSize: 22, letterSpacing: -0.3 }}>Prenotazioni</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}
      >
        {/* Richieste rimborso */}
        <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
          <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>
            Richieste di rimborso ({refundReqs.length})
          </Text>
          {refundReqs.length === 0 ? (
            <View style={{ backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 16 }}>
              <Text style={{ color: COLORS.textSecondary, fontSize: 13 }}>Nessuna richiesta in attesa.</Text>
            </View>
          ) : refundReqs.map(r => (
            <View key={r.id} style={{ backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 14, marginBottom: 8 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{r.snapshot_full_name || 'Utente'}</Text>
              <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                {r.events?.title || 'Evento'} · {r.events?.event_date || '-'} · rimborso ≈ {euro(r.total_price)}
              </Text>
              {r.refund_request_reason ? (
                <Text style={{ color: COLORS.textSecondary, fontSize: 12, marginTop: 4 }}>Motivo: {r.refund_request_reason}</Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Pressable onPress={() => resolveRefund(r.id, 'approve')} disabled={busy === r.id}
                  style={{ flex: 1, backgroundColor: 'rgba(74,222,128,0.12)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.35)', borderRadius: 8, paddingVertical: 9, alignItems: 'center' }}>
                  {busy === r.id ? <ActivityIndicator size="small" color={COLORS.success} /> : (
                    <Text style={{ color: COLORS.success, fontSize: 12, fontWeight: '700' }}>Approva rimborso</Text>
                  )}
                </Pressable>
                <Pressable onPress={() => resolveRefund(r.id, 'reject')} disabled={busy === r.id}
                  style={{ flex: 1, backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: 8, paddingVertical: 9, alignItems: 'center' }}>
                  <Text style={{ color: COLORS.danger, fontSize: 12, fontWeight: '700' }}>Rifiuta</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>

        {/* Tutte le prenotazioni */}
        <View style={{ paddingHorizontal: 20 }}>
          <Text style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>
            Tutte le prenotazioni
          </Text>

          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: COLORS.bgElev3, borderRadius: 8,
            borderWidth: 1, borderColor: COLORS.borderSubtle,
            paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10,
          }}>
            <TextInput
              value={search} onChangeText={setSearch}
              placeholder="Cerca per nome o evento..."
              placeholderTextColor={COLORS.textDisabled}
              style={{ flex: 1, color: '#fff', fontSize: 13, paddingVertical: 0 }}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')} hitSlop={10}>
                <Text style={{ color: COLORS.textMuted, fontSize: 16 }}>×</Text>
              </Pressable>
            )}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 12 }}>
            {FILTERS.map(([fid, label]) => {
              const active = filter === fid;
              return (
                <Pressable key={fid} onPress={() => setFilter(fid)}
                  style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: active ? COLORS.textPrimary : 'transparent', borderWidth: 1, borderColor: active ? COLORS.textPrimary : COLORS.borderSubtle }}>
                  <Text style={{ color: active ? COLORS.bg : COLORS.textSecondary, fontSize: 11, fontWeight: active ? '600' : '500' }}>{label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {filtered.length === 0 ? (
            <View style={{ backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 20, alignItems: 'center' }}>
              <Text style={{ color: COLORS.textSecondary, fontSize: 13 }}>Nessuna prenotazione trovata.</Text>
            </View>
          ) : filtered.map(b => {
            const isOpen = expanded === b.id;
            return (
              <Pressable key={b.id} onPress={() => setExpanded(isOpen ? null : b.id)}
                style={{ backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: b.checked_in ? 'rgba(74,222,128,0.2)' : COLORS.borderSubtle }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }} numberOfLines={1}>
                      {b.snapshot_full_name || 'Utente'}
                    </Text>
                    <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 3 }} numberOfLines={1}>
                      {b.events?.title || 'Evento'} · {b.events?.venues?.name || '-'} · {formatDate(b.events?.event_date)}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                      <Text style={{ color: COLORS.textSecondary, fontSize: 11 }}>{euro(b.total_price)}</Text>
                      <Text style={{ color: b.status === 'confirmed' ? COLORS.success : COLORS.danger, fontSize: 11, fontWeight: '600' }}>
                        {STATUS_LABELS[b.status] || b.status}
                      </Text>
                      {b.checked_in && <Text style={{ color: COLORS.success, fontSize: 11 }}>Entrato</Text>}
                    </View>
                  </View>
                  <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>{isOpen ? '▲' : '▼'}</Text>
                </View>
                {isOpen && (
                  <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.borderSubtle }}>
                    <Text style={{ color: COLORS.textMuted, fontSize: 11, marginBottom: 10 }}>
                      {b.table_id ? 'Quota tavolo' : (b.booking_type || 'Biglietto')} · quantità {b.quantity || 1} · fee {euro(b.fee)}
                      {'\n'}{b.stripe_session_id ? 'Pagata (Stripe)' : 'Gratuita'} · creata {b.created_at ? new Date(b.created_at).toLocaleString('it-IT') : '-'}
                    </Text>
                    {b.status === 'confirmed' && (
                      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                        <Pressable onPress={() => toggleCheckIn(b)} disabled={busy === b.id}
                          style={{ backgroundColor: COLORS.brandStrong, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
                          {busy === b.id ? <ActivityIndicator size="small" color="#fff" /> : (
                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>
                              {b.checked_in ? 'Annulla check-in' : 'Check-in'}
                            </Text>
                          )}
                        </Pressable>
                        {b.stripe_session_id && (
                          <Pressable onPress={() => denyAndRefund(b)} disabled={busy === b.id}
                            style={{ backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
                            <Text style={{ color: COLORS.danger, fontSize: 11, fontWeight: '600' }}>Nega + rimborsa</Text>
                          </Pressable>
                        )}
                        <Pressable onPress={() => cancelNoRefund(b)} disabled={busy === b.id}
                          style={{ backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
                          <Text style={{ color: COLORS.danger, fontSize: 11, fontWeight: '600' }}>Annulla senza rimborso</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                )}
              </Pressable>
            );
          })}

          {bookings.length >= limit && (
            <Pressable onPress={loadMore}
              style={{ borderWidth: 1, borderColor: COLORS.borderSubtle, borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 4 }}>
              <Text style={{ color: COLORS.textSecondary, fontSize: 13 }}>Carica altre</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
