import { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Image, Alert, ActivityIndicator, Platform, KeyboardAvoidingView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';
import { useI18n } from '../../lib/i18n';
import { uploadPickedImage, imageExt } from '../../lib/uploadImage';
import { COLORS, FONT_FAMILY } from '@lets-night/shared';

const CATS = ['booking', 'payment', 'account', 'event', 'bug', 'other'];

export default function SupportNewScreen() {
  const { t, lang, fmtDate } = useI18n();
  const router = useRouter();
  const { session, loading: loadingAuth } = useSession();
  const myId = session?.user?.id;

  const [category, setCategory] = useState(null);
  const [desc, setDesc] = useState('');
  const [booking, setBooking] = useState(null);
  const [myBookings, setMyBookings] = useState([]);
  const [shot, setShot] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    // Aspetta che useSession finisca: al primo render session è null (loading)
    // anche se l'utente è loggato → senza questa guardia si redirige a login = loop.
    if (loadingAuth) return;
    if (!myId) { router.replace('/auth/login'); return; }
    (async () => {
      const { data } = await supabase
        .from('bookings')
        .select('id, event_id, events(title, event_date, event_time)')
        .eq('user_id', myId)
        .order('created_at', { ascending: false })
        .limit(15);
      setMyBookings((data || []).filter(b => b.events));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId, loadingAuth]);

  async function pickScreenshot() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('profileEdit.permDeniedTitle'), t('profileEdit.permDeniedBody'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, base64: true });
    if (result.canceled || !result.assets?.[0]) return;
    setShot(result.assets[0]);
  }

  async function submit() {
    const body = desc.trim();
    if (!body) { Alert.alert(t('common.error'), t('support.errorDesc')); return; }
    setSending(true);
    try {
      const { data: ticket, error: tErr } = await supabase
        .from('support_tickets')
        .insert({
          user_id: myId,
          category: category || 'other',
          subject: body.slice(0, 80),
          related_booking_id: booking?.id || null,
          related_event_id: booking?.event_id || null,
          app_version: Constants.expoConfig?.version || null,
          platform: Platform.OS,
          locale: lang,
        })
        .select('id')
        .single();
      if (tErr || !ticket) throw tErr || new Error('no ticket');

      // Screenshot facoltativo: se l'upload fallisce non blocchiamo il ticket.
      let attachmentPath = null;
      if (shot) {
        try {
          const path = `${myId}/${ticket.id}/shot.${imageExt(shot)}`;
          await uploadPickedImage('support-attachments', path, shot);
          attachmentPath = path;
        } catch (e) {
          console.error('Errore upload screenshot:', e);
        }
      }

      const { error: mErr } = await supabase.from('support_messages').insert({
        ticket_id: ticket.id,
        sender: 'user',
        author_id: myId,
        body,
        attachment_path: attachmentPath,
      });
      if (mErr) throw mErr;

      router.replace(`/support/${ticket.id}`);
    } catch (e) {
      console.error('Errore invio ticket:', e);
      Alert.alert(t('common.error'), t('support.errorSend'));
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: COLORS.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontFamily: FONT_FAMILY.displayHeavy, color: COLORS.textPrimary, fontSize: 24, marginBottom: 22 }}>
          {t('support.newTitle')}
        </Text>

        {/* Categoria */}
        <Text style={{ color: COLORS.textMuted, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>
          {t('support.catLabel')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
          {CATS.map(c => {
            const on = category === c;
            return (
              <Pressable
                key={c}
                onPress={() => setCategory(c)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
                  backgroundColor: on ? COLORS.brand : COLORS.bgElev2,
                  borderWidth: 1, borderColor: on ? COLORS.brand : COLORS.borderSubtle,
                }}
              >
                <Text style={{ color: on ? '#fff' : COLORS.textSecondary, fontSize: 13, fontWeight: '600' }}>
                  {t('support.cat.' + c)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Descrizione */}
        <Text style={{ color: COLORS.textMuted, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>
          {t('support.descLabel')}
        </Text>
        <TextInput
          value={desc}
          onChangeText={setDesc}
          placeholder={t('support.descPlaceholder')}
          placeholderTextColor={COLORS.textDisabled}
          multiline
          textAlignVertical="top"
          style={{
            minHeight: 120, backgroundColor: COLORS.bgElev2, borderRadius: 12,
            borderWidth: 1, borderColor: COLORS.borderSubtle, padding: 14,
            color: COLORS.textPrimary, fontSize: 15, lineHeight: 21, marginBottom: 22,
          }}
        />

        {/* Prenotazione collegata (facoltativa) */}
        {myBookings.length > 0 && (
          <>
            <Text style={{ color: COLORS.textMuted, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>
              {t('support.relatedBooking')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
              <Pressable
                onPress={() => setBooking(null)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
                  backgroundColor: !booking ? COLORS.brand : COLORS.bgElev2,
                  borderWidth: 1, borderColor: !booking ? COLORS.brand : COLORS.borderSubtle,
                }}
              >
                <Text style={{ color: !booking ? '#fff' : COLORS.textSecondary, fontSize: 13, fontWeight: '600' }}>{t('support.noBooking')}</Text>
              </Pressable>
              {myBookings.map(b => {
                const on = booking?.id === b.id;
                return (
                  <Pressable
                    key={b.id}
                    onPress={() => setBooking(b)}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, maxWidth: '100%',
                      backgroundColor: on ? COLORS.brand : COLORS.bgElev2,
                      borderWidth: 1, borderColor: on ? COLORS.brand : COLORS.borderSubtle,
                    }}
                  >
                    <Text numberOfLines={1} style={{ color: on ? '#fff' : COLORS.textSecondary, fontSize: 13, fontWeight: '600' }}>
                      {b.events.title} · {fmtDate(b.events.event_date)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {/* Screenshot (facoltativo) */}
        <Pressable
          onPress={pickScreenshot}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 22,
            backgroundColor: COLORS.bgElev2, borderRadius: 12, borderWidth: 1,
            borderColor: COLORS.borderSubtle, borderStyle: 'dashed', padding: 14,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          {shot ? (
            <Image source={{ uri: shot.uri }} style={{ width: 40, height: 40, borderRadius: 8 }} />
          ) : (
            <Ionicons name="image-outline" size={22} color={COLORS.textMuted} />
          )}
          <Text style={{ color: COLORS.textSecondary, fontSize: 14, fontWeight: '600' }}>
            {shot ? t('support.changeScreenshot') : t('support.addScreenshot')}
          </Text>
        </Pressable>

        {/* Invia */}
        <Pressable
          onPress={submit}
          disabled={sending}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            backgroundColor: COLORS.brandStrong, borderRadius: 12, paddingVertical: 15,
            opacity: sending ? 0.6 : (pressed ? 0.85 : 1),
          })}
        >
          {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={16} color="#fff" />}
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>
            {sending ? t('support.sending') : t('support.send')}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
