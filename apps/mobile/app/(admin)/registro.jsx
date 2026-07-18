import { useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { COLORS, FONT_FAMILY } from '@lets-night/shared';
import { Ionicons } from '@expo/vector-icons';

// REGISTRO (audit_logs) — versione app della pagina /admin/registro web.
// Sola lettura per design: le righe le scrivono solo server e trigger.

const TYPE_LABELS = {
  payment_fulfilled: 'Pagamento completato',
  payment_anomaly_refund: 'Anomalia pagamento (auto-rimborso)',
  payment_orphan: 'Pagamento orfano',
  webhook_event: 'Evento Stripe',
  refund_requested: 'Richiesta rimborso',
  refund_resolved: 'Richiesta rimborso decisa',
  refund_done: 'Rimborso eseguito',
  refund_failed: 'Rimborso fallito',
  chargeback: 'Chargeback',
  scan_rejected: 'Scan rifiutato',
  scan_duplicate: 'QR già scannerizzato',
  booking_created: 'Prenotazione creata',
  booking_cancelled: 'Prenotazione annullata',
  booking_denied: 'Ingresso negato',
  booking_status_change: 'Cambio stato prenotazione',
  booking_deleted: 'Prenotazione eliminata',
  checkin_set: 'Check-in',
  checkin_removed: 'Check-in rimosso',
  qr_invalidated: 'QR invalidato',
  event_price_changed: 'Prezzo evento modificato',
  ticket_type_price_changed: 'Prezzo tipologia ingresso modificato',
  table_member_moved: 'Partecipante spostato di tavolo',
};

const SEVERITY_META = {
  info: { label: 'Info', color: '#60a5fa' },
  warn: { label: 'Attenzione', color: COLORS.warning },
  error: { label: 'Errore', color: COLORS.danger },
};

const PERIODS = [[7, '7 giorni'], [30, '30 giorni'], [90, '90 giorni'], [365, '1 anno']];

function daysAgoIso(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export default function AdminRegistro() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState([]);
  const [expanded, setExpanded] = useState(null);
  // Default: solo i problemi (warn+error); "Tutto" = cronaca completa.
  const [fView, setFView] = useState('problems');
  const [fType, setFType] = useState('');
  const [fDays, setFDays] = useState(30);
  const [missing, setMissing] = useState(false);
  const filtersRef = useRef({ view: 'problems', type: '', days: 30 });

  async function loadData(view = filtersRef.current.view, type = filtersRef.current.type, days = filtersRef.current.days) {
    let q = supabase
      .from('audit_logs')
      .select('*')
      .gte('created_at', daysAgoIso(days))
      .order('created_at', { ascending: false })
      .limit(200);
    if (view === 'problems') q = q.neq('severity', 'info');
    if (type) q = q.eq('type', type);
    const { data, error } = await q;
    if (error) {
      console.error('Errore registro admin:', error);
      setMissing(true);
      setRows([]);
    } else {
      setMissing(false);
      setRows(data || []);
    }
    setLoading(false);
  }

  useFocusEffect(useCallback(() => { loadData(); }, []));
  const onRefresh = useCallback(async () => { setRefreshing(true); await loadData(); setRefreshing(false); }, [fView, fType, fDays]);

  function setView(v) { setFView(v); filtersRef.current = { ...filtersRef.current, view: v }; loadData(v, fType, fDays); }
  function setType(v) { setFType(v); filtersRef.current = { ...filtersRef.current, type: v }; loadData(fView, v, fDays); }
  function setDays(v) { setFDays(v); filtersRef.current = { ...filtersRef.current, days: v }; loadData(fView, fType, v); }

  if (loading) return <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={COLORS.brand} size="large" /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 10, flexDirection: 'row', alignItems: 'center' }}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(admin)'))} hitSlop={10}>
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </View>
        </Pressable>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ fontFamily: FONT_FAMILY.display, color: '#fff', fontSize: 18 }}>Registro</Text>
          <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 2 }}>Movimenti soldi e frode · sola lettura</Text>
        </View>
      </View>

      {/* Problemi | Tutto */}
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 8 }}>
        {[['problems', 'Problemi'], ['all', 'Tutto']].map(([id, label]) => {
          const on = fView === id;
          return (
            <Pressable key={id} onPress={() => setView(id)}
              style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: on ? COLORS.textPrimary : COLORS.bgElev2, borderWidth: 1, borderColor: on ? COLORS.textPrimary : COLORS.borderSubtle }}>
              <Text style={{ color: on ? COLORS.bg : COLORS.textSecondary, fontSize: 13, fontWeight: '700' }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Periodo */}
      <ScrollView horizontal showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} style={{ maxHeight: 36 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 6, paddingBottom: 8 }}>
        {PERIODS.map(([n, label]) => {
          const on = fDays === n;
          return (
            <Pressable key={n} onPress={() => setDays(n)}
              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: on ? COLORS.textPrimary : 'transparent', borderWidth: 1, borderColor: on ? COLORS.textPrimary : COLORS.borderSubtle }}>
              <Text style={{ color: on ? COLORS.bg : COLORS.textSecondary, fontSize: 11, fontWeight: on ? '600' : '500' }}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Tipo */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 36 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 6, paddingBottom: 10 }}>
        {[['', 'Tutti i tipi'], ...Object.entries(TYPE_LABELS)].map(([k, v]) => {
          const on = fType === k;
          return (
            <Pressable key={k || 'all'} onPress={() => setType(k)}
              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: on ? COLORS.textPrimary : 'transparent', borderWidth: 1, borderColor: on ? COLORS.textPrimary : COLORS.borderSubtle }}>
              <Text style={{ color: on ? COLORS.bg : COLORS.textSecondary, fontSize: 11, fontWeight: on ? '600' : '500' }}>{v}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}>
        {missing ? (
          <View style={{ backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 20 }}>
            <Text style={{ color: COLORS.textSecondary, fontSize: 13 }}>Registro non attivo: applicare la migration 20260713_audit_logs.sql.</Text>
          </View>
        ) : rows.length === 0 ? (
          <View style={{ backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 20, alignItems: 'center' }}>
            <Text style={{ color: COLORS.textSecondary, fontSize: 13 }}>
              {fView === 'problems' ? 'Nessun problema nel periodo. 🎉' : 'Nessuna voce nel periodo.'}
            </Text>
          </View>
        ) : rows.map(r => {
          const sev = SEVERITY_META[r.severity] || SEVERITY_META.info;
          const isOpen = expanded === r.id;
          return (
            <Pressable key={r.id} onPress={() => setExpanded(isOpen ? null : r.id)}
              style={{ backgroundColor: COLORS.bgElev2, borderRadius: 12, padding: 14, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: sev.color }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }} numberOfLines={1}>{TYPE_LABELS[r.type] || r.type}</Text>
                  <Text style={{ color: sev.color, fontSize: 11, marginTop: 3 }}>
                    {sev.label} · {new Date(r.created_at).toLocaleString('it-IT')}
                  </Text>
                  {r.message ? (
                    <Text style={{ color: COLORS.textSecondary, fontSize: 12, marginTop: 3 }} numberOfLines={isOpen ? 0 : 1}>{r.message}</Text>
                  ) : null}
                </View>
                <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>{isOpen ? '▲' : '▼'}</Text>
              </View>
              {isOpen && (
                <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.borderSubtle }}>
                  <Text style={{ color: COLORS.textMuted, fontSize: 11 }} selectable>
                    {r.booking_id ? `Prenotazione: ${r.booking_id}\n` : ''}
                    {r.event_id ? `Evento: ${r.event_id}\n` : ''}
                    {r.user_id ? `Utente: ${r.user_id}\n` : ''}
                    {`Autore: ${r.actor_id || 'server'}`}
                  </Text>
                  {r.details ? (
                    <View style={{ backgroundColor: COLORS.bgElev3, borderRadius: 8, padding: 10, marginTop: 8 }}>
                      <Text style={{ color: COLORS.textSecondary, fontSize: 11, fontFamily: 'Courier' }} selectable>
                        {JSON.stringify(r.details, null, 2)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
