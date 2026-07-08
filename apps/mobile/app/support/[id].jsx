import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Image, ActivityIndicator, Modal, Platform, KeyboardAvoidingView } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
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

export default function SupportTicketScreen() {
  const { id } = useLocalSearchParams();
  const { t, fmtDate } = useI18n();
  const router = useRouter();
  const { session, loading: loadingAuth } = useSession();
  const myId = session?.user?.id;

  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [sigUrls, setSigUrls] = useState({});
  const [eventTitle, setEventTitle] = useState(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [zoomUrl, setZoomUrl] = useState(null);

  const loadAll = useCallback(async () => {
    const { data: tk } = await supabase.from('support_tickets').select('*').eq('id', id).maybeSingle();
    if (!tk) { setNotFound(true); return; }
    setTicket(tk);

    const { data: msgs } = await supabase
      .from('support_messages')
      .select('*')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true });
    const list = msgs || [];
    setMessages(list);

    if (tk.related_event_id) {
      const { data: ev } = await supabase.from('events').select('title').eq('id', tk.related_event_id).maybeSingle();
      setEventTitle(ev?.title || null);
    }

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
    // Aspetta useSession: session è null al primo render anche da loggato → evita redirect-loop.
    if (loadingAuth) return;
    if (!myId) { router.replace('/auth/login'); return; }
    setLoading(true);
    loadAll().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId, loadingAuth, id]));

  async function send() {
    const body = reply.trim();
    if (!body || sending) return;
    setSending(true);
    const { error } = await supabase.from('support_messages').insert({
      ticket_id: id,
      sender: 'user',
      author_id: myId,
      body,
    });
    if (error) { console.error('Errore risposta:', error); setSending(false); return; }
    setReply('');
    await loadAll();
    setSending(false);
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={COLORS.brand} />
      </View>
    );
  }

  if (notFound || !ticket) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
        <Ionicons name="alert-circle-outline" size={36} color={COLORS.textMuted} style={{ marginBottom: 12 }} />
        <Text style={{ color: COLORS.textMuted, fontSize: 14, textAlign: 'center' }}>{t('common.error')}</Text>
      </View>
    );
  }

  const color = STATUS_COLOR[ticket.status] || COLORS.textSecondary;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: COLORS.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 24 }}>
        {/* Contesto ticket */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Text style={{ flex: 1, color: COLORS.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' }}>
            {t('support.cat.' + ticket.category)}
          </Text>
          <View style={{ backgroundColor: `${color}22`, borderWidth: 1, borderColor: `${color}55`, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 }}>
            <Text style={{ color, fontSize: 11, fontWeight: '800' }}>{t('support.status.' + ticket.status)}</Text>
          </View>
        </View>
        <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 20, letterSpacing: -0.3, marginBottom: 6 }}>
          {ticket.subject}
        </Text>
        {eventTitle ? (
          <Text style={{ color: COLORS.textSecondary, fontSize: 13, marginBottom: 2 }}>{t('support.ticketOn')} {eventTitle}</Text>
        ) : null}
        {ticket.app_version || ticket.platform ? (
          <Text style={{ color: COLORS.textDisabled, fontSize: 11, marginBottom: 18 }}>
            {t('support.contextApp', { version: ticket.app_version || '—', platform: ticket.platform || '—' })}
          </Text>
        ) : <View style={{ marginBottom: 18 }} />}

        {/* Messaggi */}
        {messages.map(m => {
          const mine = m.sender === 'user';
          const d = new Date(m.created_at);
          const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
          const att = sigUrls[m.id];
          return (
            <View key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '86%', marginBottom: 14 }}>
              <Text style={{ color: COLORS.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4, textAlign: mine ? 'right' : 'left' }}>
                {mine ? t('support.you') : t('support.team')} · {fmtDate(m.created_at)} · {hm}
              </Text>
              <View style={{
                backgroundColor: mine ? COLORS.brand : COLORS.bgElev2,
                borderWidth: mine ? 0 : 1, borderColor: COLORS.borderSubtle,
                borderRadius: 16, borderTopRightRadius: mine ? 4 : 16, borderTopLeftRadius: mine ? 16 : 4,
                paddingHorizontal: 14, paddingVertical: 11,
              }}>
                <Text style={{ color: mine ? '#fff' : COLORS.textPrimary, fontSize: 15, lineHeight: 21 }}>{m.body}</Text>
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
          placeholder={t('support.replyPlaceholder')}
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

      {/* Zoom screenshot */}
      <Modal visible={!!zoomUrl} transparent animationType="fade" onRequestClose={() => setZoomUrl(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center', padding: 20 }} onPress={() => setZoomUrl(null)}>
          {zoomUrl ? <Image source={{ uri: zoomUrl }} style={{ width: '100%', height: '80%' }} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}
