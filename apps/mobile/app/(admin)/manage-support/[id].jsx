import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Image, ActivityIndicator, Modal, Platform, KeyboardAvoidingView } from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
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
const STATUSES = ['open', 'in_progress', 'waiting_user', 'resolved', 'closed'];

function fmt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }) + ' · ' +
    String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

export default function AdminSupportThread() {
  const { id } = useLocalSearchParams();
  const [adminId, setAdminId] = useState(null);
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [sigUrls, setSigUrls] = useState({});
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [zoomUrl, setZoomUrl] = useState(null);

  const loadAll = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setAdminId(session?.user?.id || null);

    const { data: tk } = await supabase
      .from('support_tickets')
      .select('*, profiles(full_name), events(title)')
      .eq('id', id)
      .maybeSingle();
    if (!tk) { setNotFound(true); return; }
    setTicket(tk);

    const { data: msgs } = await supabase
      .from('support_messages')
      .select('*')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true });
    const list = msgs || [];
    setMessages(list);

    const withAtt = list.filter(m => m.attachment_path);
    if (withAtt.length) {
      const entries = await Promise.all(withAtt.map(async m => {
        const { data } = await supabase.storage.from('support-attachments').createSignedUrl(m.attachment_path, 3600);
        return [m.id, data?.signedUrl];
      }));
      setSigUrls(Object.fromEntries(entries.filter(([, u]) => u)));
    }
  }, [id]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    loadAll().finally(() => setLoading(false));
  }, [loadAll]));

  function goBack() {
    if (router.canGoBack()) router.back(); else router.replace('/(admin)/manage-support');
  }

  async function send() {
    const body = reply.trim();
    if (!body || sending) return;
    setSending(true);
    // Il trigger notify_on_support_reply notifica l'utente e porta lo stato a "in attesa utente".
    const { error } = await supabase.from('support_messages').insert({
      ticket_id: id, sender: 'admin', author_id: adminId, body,
    });
    if (error) { console.error('Errore risposta admin:', error); setSending(false); return; }
    setReply('');
    await loadAll();
    setSending(false);
  }

  async function changeStatus(next) {
    if (!ticket || next === ticket.status || savingStatus) return;
    setSavingStatus(true);
    const { error } = await supabase.from('support_tickets')
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { console.error('Errore stato ticket:', error); setSavingStatus(false); return; }
    setTicket(t => ({ ...t, status: next }));
    setSavingStatus(false);
  }

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={COLORS.brand} size="large" /></View>;
  }

  if (notFound || !ticket) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
        <Ionicons name="alert-circle-outline" size={36} color={COLORS.textMuted} style={{ marginBottom: 12 }} />
        <Text style={{ color: COLORS.textMuted, fontSize: 14, textAlign: 'center', marginBottom: 20 }}>Ticket non trovato.</Text>
        <Pressable onPress={goBack} style={{ paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.borderStrong }}>
          <Text style={{ color: COLORS.textSecondary, fontWeight: '700' }}>Indietro</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: COLORS.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 10, flexDirection: 'row', alignItems: 'center' }}>
        <Pressable onPress={goBack} hitSlop={10}>
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </View>
        </Pressable>
        <Text style={{ flex: 1, fontFamily: FONT_FAMILY.display, color: '#fff', fontSize: 17, marginLeft: 12 }} numberOfLines={1}>Ticket</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
        <Text style={{ color: COLORS.brand, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>
          {CAT_LABELS[ticket.category] || ticket.category}
        </Text>
        <Text style={{ fontFamily: FONT_FAMILY.display, color: '#fff', fontSize: 20, marginBottom: 4 }}>{ticket.subject}</Text>
        <Text style={{ color: COLORS.textMuted, fontSize: 12, marginBottom: 2 }}>
          {ticket.profiles?.full_name || 'Utente'}{ticket.events?.title ? ` · ${ticket.events.title}` : ''}
        </Text>
        <Text style={{ color: COLORS.textDisabled, fontSize: 11, marginBottom: 14 }}>
          App {ticket.app_version || '—'} · {ticket.platform || '—'} · {ticket.locale || '—'} · aperto {fmt(ticket.created_at)}
        </Text>

        {/* Stato */}
        <Text style={{ color: COLORS.textMuted, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>Stato</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 4 }} style={{ marginBottom: 18 }}>
          {STATUSES.map(s => {
            const active = ticket.status === s;
            const color = STATUS_COLOR[s];
            return (
              <Pressable key={s} onPress={() => changeStatus(s)} disabled={savingStatus}
                style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, backgroundColor: active ? color : 'transparent', borderWidth: 1, borderColor: active ? color : COLORS.borderSubtle }}>
                <Text style={{ color: active ? '#fff' : COLORS.textSecondary, fontSize: 12, fontWeight: active ? '700' : '500' }}>{STATUS_LABELS[s]}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Messaggi */}
        {messages.map(m => {
          const admin = m.sender === 'admin';
          const att = sigUrls[m.id];
          return (
            <View key={m.id} style={{ alignSelf: admin ? 'flex-end' : 'flex-start', maxWidth: '86%', marginBottom: 14 }}>
              <Text style={{ color: COLORS.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4, textAlign: admin ? 'right' : 'left' }}>
                {admin ? 'Assistenza' : (ticket.profiles?.full_name || 'Utente')} · {fmt(m.created_at)}
              </Text>
              <View style={{
                backgroundColor: admin ? COLORS.brand : COLORS.bgElev2,
                borderWidth: admin ? 0 : 1, borderColor: COLORS.borderSubtle,
                borderRadius: 16, borderTopRightRadius: admin ? 4 : 16, borderTopLeftRadius: admin ? 16 : 4,
                paddingHorizontal: 14, paddingVertical: 11,
              }}>
                <Text style={{ color: admin ? '#fff' : COLORS.textPrimary, fontSize: 15, lineHeight: 21 }}>{m.body}</Text>
                {att ? (
                  <Pressable onPress={() => setZoomUrl(att)} style={{ marginTop: 10 }}>
                    <Image source={{ uri: att }} style={{ width: 180, height: 120, borderRadius: 10, backgroundColor: COLORS.bgElev1 }} resizeMode="cover" />
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Risposta */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 24 : 14, borderTopWidth: 1, borderTopColor: COLORS.borderSubtle, backgroundColor: COLORS.bg }}>
        <TextInput
          value={reply}
          onChangeText={setReply}
          placeholder="Rispondi all'utente..."
          placeholderTextColor={COLORS.textDisabled}
          multiline
          style={{ flex: 1, maxHeight: 120, backgroundColor: COLORS.bgElev2, borderRadius: 20, borderWidth: 1, borderColor: COLORS.borderSubtle, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, color: COLORS.textPrimary, fontSize: 15 }}
        />
        <Pressable
          onPress={send}
          disabled={sending || !reply.trim()}
          style={({ pressed }) => ({
            width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
            backgroundColor: COLORS.brandStrong, opacity: (sending || !reply.trim()) ? 0.5 : (pressed ? 0.85 : 1),
          })}
        >
          {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={18} color="#fff" />}
        </Pressable>
      </View>

      <Modal visible={!!zoomUrl} transparent animationType="fade" onRequestClose={() => setZoomUrl(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center', padding: 20 }} onPress={() => setZoomUrl(null)}>
          {zoomUrl ? <Image source={{ uri: zoomUrl }} style={{ width: '100%', height: '80%' }} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}
