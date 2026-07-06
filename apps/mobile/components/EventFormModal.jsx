import { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, TextInput, Modal, Alert, KeyboardAvoidingView, Platform, Image } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { uploadPickedImage, imageExt } from '../lib/uploadImage';
import { COLORS, FONT_FAMILY, CATS_NO_TUTTI } from '@lets-night/shared';
import { useI18n } from '../lib/i18n';

const EMPTY = { title: '', description: '', category: 'Discoteca', event_date: '', event_time: '', end_time: '', price: '', capacity: '' };

const GIORNI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseNumber(str) {
  if (!str) return null;
  const n = parseFloat(String(str).replace(',', '.').trim());
  return isNaN(n) ? null : n;
}
function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function hm(d) { return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function ymdToDate(s) { if (!s) return new Date(); const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function hmToDate(s) { const d = new Date(); if (s) { const [h, mm] = s.split(':').map(Number); d.setHours(h, mm, 0, 0); } else { d.setHours(22, 0, 0, 0); } return d; }
function prettyDate(s) {
  if (!s) return '';
  const d = ymdToDate(s);
  return `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]} ${d.getFullYear()}`;
}

const inputStyle = { backgroundColor: COLORS.bgElev3, borderWidth: 1, borderColor: COLORS.borderSubtle, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 14 };
const labelStyle = { color: COLORS.textMuted, fontSize: 11, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 };

// Form evento condiviso tra creazione (events.jsx) e modifica (business-event/[id]).
// Data via calendario, orari via picker a scorrimento. Formato salvato: YYYY-MM-DD / HH:MM.
export default function EventFormModal({ visible, onClose, mode = 'create', venueId, event, onSaved }) {
  const { t } = useI18n();
  const isEdit = mode === 'edit';
  const [form, setForm] = useState(EMPTY);
  const [coverAsset, setCoverAsset] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState(null); // null | 'date' | 'start' | 'end'

  useEffect(() => {
    if (!visible) return;
    if (isEdit && event) {
      setForm({
        title: event.title || '',
        description: event.description || '',
        category: event.category || 'Discoteca',
        event_date: event.event_date || '',
        event_time: (event.event_time || '').slice(0, 5),
        end_time: (event.end_time || '').slice(0, 5),
        price: event.price != null ? String(event.price) : '',
        capacity: event.capacity != null ? String(event.capacity) : '',
      });
      setCoverPreview(event.cover_image || null);
    } else {
      setForm(EMPTY);
      setCoverPreview(null);
    }
    setCoverAsset(null);
    setPicker(null);
  }, [visible, isEdit, event]);

  async function pickCover() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert(t('profileEdit.permDeniedTitle'), t('profileEdit.permDeniedBody')); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [16, 10], quality: 0.75, base64: true });
    if (result.canceled || !result.assets?.[0]) return;
    setCoverAsset(result.assets[0]);
    setCoverPreview(result.assets[0].uri);
  }

  function onPickerChange(e, selected) {
    if (Platform.OS === 'android') {
      setPicker(null);
      if (e.type === 'dismissed' || !selected) return;
    }
    if (!selected) return;
    if (picker === 'date') setForm(f => ({ ...f, event_date: ymd(selected) }));
    else if (picker === 'start') setForm(f => ({ ...f, event_time: hm(selected) }));
    else if (picker === 'end') setForm(f => ({ ...f, end_time: hm(selected) }));
  }

  async function submit() {
    if (saving) return;
    if (!form.title || !form.event_date || !form.event_time || !form.end_time) {
      Alert.alert(t('eventForm.missingTitle'), t('eventForm.missingBody'));
      return;
    }
    if (!isEdit && form.event_date < todayLocal()) {
      Alert.alert(t('eventForm.pastDateTitle'), t('eventForm.pastDateBody'));
      return;
    }
    const price = parseNumber(form.price) ?? 0;
    const capacity = form.capacity ? parseInt(String(form.capacity).replace(/\D/g, ''), 10) : null;
    const payload = {
      title: form.title,
      description: form.description,
      category: form.category,
      event_date: form.event_date,
      event_time: form.event_time,
      end_time: form.end_time,
      price,
      capacity: capacity || null,
    };
    setSaving(true);
    try {
      const vId = isEdit ? event.venue_id : venueId;
      let eventId = isEdit ? event.id : null;
      if (isEdit) {
        const { error } = await supabase.from('events').update(payload).eq('id', event.id);
        if (error) { Alert.alert(t('common.error'), error.message); return; }
      } else {
        const { data: created, error } = await supabase.from('events')
          .insert({ ...payload, venue_id: venueId, has_tables: false, is_active: true })
          .select('id').single();
        if (error) { Alert.alert(t('common.error'), error.message); return; }
        eventId = created?.id;
      }
      // Cover: solo se è stata scelta una NUOVA foto. Bucket 'venue-covers', path event-<id>.
      if (coverAsset && eventId && vId) {
        try {
          const path = `${vId}/event-${eventId}.${imageExt(coverAsset)}`;
          const publicUrl = await uploadPickedImage('venue-covers', path, coverAsset);
          await supabase.from('events').update({ cover_image: `${publicUrl}?v=${Date.now()}` }).eq('id', eventId);
        } catch (err) {
          console.error('Errore upload cover evento:', err);
          Alert.alert(isEdit ? t('eventForm.savedNoCoverTitleEdit') : t('eventForm.savedNoCoverTitleNew'), t('eventForm.savedNoCoverBody'));
        }
      }
      onSaved?.();
      onClose?.();
    } finally {
      setSaving(false);
    }
  }

  const pickerDisplay = picker === 'date' ? (Platform.OS === 'ios' ? 'inline' : 'calendar') : 'spinner';
  const pickerValue = picker === 'date' ? ymdToDate(form.event_date)
    : picker === 'start' ? hmToDate(form.event_time)
    : picker === 'end' ? hmToDate(form.end_time) : new Date();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={onClose} />
          <View style={{ backgroundColor: COLORS.bgElev2, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24, maxHeight: '92%', borderTopWidth: 1, borderColor: COLORS.borderSubtle }}>
            <View style={{ width: 40, height: 4, backgroundColor: COLORS.borderStrong, borderRadius: 2, alignSelf: 'center', marginBottom: 14 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Pressable onPress={onClose} hitSlop={8}><Ionicons name="close" size={24} color={COLORS.textSecondary} /></Pressable>
                <Text style={{ fontFamily: FONT_FAMILY.displayHeavy, color: '#fff', fontSize: 18 }}>{isEdit ? t('eventForm.editTitle') : t('eventForm.newTitle')}</Text>
              </View>
              <Pressable onPress={submit} disabled={saving} hitSlop={8} style={({ pressed }) => ({ opacity: saving || pressed ? 0.5 : 1 })}>
                {saving ? <ActivityIndicator size="small" color={COLORS.textPrimary} /> : <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 16 }}>{isEdit ? t('eventForm.saveBtn') : t('eventForm.publishBtn')}</Text>}
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
              {/* Copertina */}
              <View style={{ marginBottom: 14 }}>
                <Text style={labelStyle}>{t('eventForm.cover')}</Text>
                <Pressable onPress={pickCover} style={{ height: 150, borderRadius: 12, overflow: 'hidden', backgroundColor: COLORS.bgElev3, borderWidth: 1, borderColor: COLORS.borderSubtle, alignItems: 'center', justifyContent: 'center' }}>
                  {coverPreview ? (
                    <>
                      <Image source={{ uri: coverPreview }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      <View style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Ionicons name="camera" size={13} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>{t('eventForm.change')}</Text>
                      </View>
                    </>
                  ) : (
                    <View style={{ alignItems: 'center', gap: 6 }}>
                      <Ionicons name="image-outline" size={22} color={COLORS.textMuted} />
                      <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>{t('eventForm.addCover')}</Text>
                    </View>
                  )}
                </Pressable>
              </View>
              {/* Titolo + Descrizione */}
              {[[t('eventForm.fTitle'), 'title', t('eventForm.fTitlePh')], [t('eventForm.fDesc'), 'description', t('eventForm.fDescPh')]].map(([label, key, ph]) => (
                <View key={key} style={{ marginBottom: 14 }}>
                  <Text style={labelStyle}>{label}</Text>
                  <TextInput
                    value={form[key]} onChangeText={v => setForm(f => ({ ...f, [key]: v }))}
                    placeholder={ph} placeholderTextColor={COLORS.textDisabled}
                    style={[inputStyle, key === 'description' && { minHeight: 70, textAlignVertical: 'top' }]}
                    multiline={key === 'description'}
                  />
                </View>
              ))}
              {/* Categoria */}
              <View style={{ marginBottom: 14 }}>
                <Text style={labelStyle}>{t('eventForm.fCategory')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {CATS_NO_TUTTI.map(c => (
                      <Pressable key={c} onPress={() => setForm(f => ({ ...f, category: c }))}
                        style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: form.category === c ? COLORS.brandStrong : COLORS.bgElev3, borderWidth: 1, borderColor: form.category === c ? COLORS.brandStrong : COLORS.borderSubtle }}>
                        <Text style={{ color: form.category === c ? '#fff' : COLORS.textSecondary, fontSize: 13 }}>{c}</Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>
              {/* Data — calendario */}
              <View style={{ marginBottom: 14 }}>
                <Text style={labelStyle}>{t('eventForm.fDate')}</Text>
                <Pressable onPress={() => setPicker('date')} style={{ ...inputStyle, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: form.event_date ? '#fff' : COLORS.textDisabled, fontSize: 14 }}>{form.event_date ? prettyDate(form.event_date) : t('eventForm.selectDate')}</Text>
                  <Ionicons name="calendar-outline" size={18} color={COLORS.textMuted} />
                </Pressable>
              </View>
              {/* Orari — picker a scorrimento */}
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
                {[[t('eventForm.fStart'), 'start', 'event_time'], [t('eventForm.fEnd'), 'end', 'end_time']].map(([label, pk, key]) => (
                  <View key={key} style={{ flex: 1 }}>
                    <Text style={labelStyle}>{label}</Text>
                    <Pressable onPress={() => setPicker(pk)} style={{ ...inputStyle, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ color: form[key] ? '#fff' : COLORS.textDisabled, fontSize: 14 }}>{form[key] || '--:--'}</Text>
                      <Ionicons name="time-outline" size={18} color={COLORS.textMuted} />
                    </Pressable>
                  </View>
                ))}
              </View>
              {/* Prezzo + Capienza */}
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
                {[[t('eventForm.fPrice'), 'price', '0'], [t('eventForm.fCapacity'), 'capacity', t('eventForm.unlimited')]].map(([label, key, ph]) => (
                  <View key={key} style={{ flex: 1 }}>
                    <Text style={labelStyle}>{label}</Text>
                    <TextInput value={form[key]} onChangeText={v => setForm(f => ({ ...f, [key]: v }))} placeholder={ph} placeholderTextColor={COLORS.textDisabled} keyboardType="numeric" style={inputStyle} />
                  </View>
                ))}
              </View>
              {!isEdit && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 8 }}>
                  <Ionicons name="information-circle-outline" size={15} color={COLORS.textMuted} />
                  <Text style={{ color: COLORS.textMuted, fontSize: 12, flex: 1, lineHeight: 16 }}>{t('eventForm.tablesHint')}</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>

        {/* Picker iOS: overlay in fondo con "Fatto" (no modal annidato) */}
        {picker && Platform.OS === 'ios' && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end' }}>
            <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={() => setPicker(null)} />
            <View style={{ backgroundColor: COLORS.bgElev2, paddingBottom: 30, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingVertical: 12 }}>
                <Pressable onPress={() => setPicker(null)} hitSlop={8}><Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 16 }}>{t('eventForm.done')}</Text></Pressable>
              </View>
              <DateTimePicker
                value={pickerValue}
                mode={picker === 'date' ? 'date' : 'time'}
                display={pickerDisplay}
                themeVariant="dark"
                locale="it-IT"
                is24Hour
                minimumDate={picker === 'date' && !isEdit ? new Date() : undefined}
                onChange={onPickerChange}
              />
            </View>
          </View>
        )}
        {/* Picker Android: dialog nativo */}
        {picker && Platform.OS === 'android' && (
          <DateTimePicker
            value={pickerValue}
            mode={picker === 'date' ? 'date' : 'time'}
            display={pickerDisplay}
            is24Hour
            minimumDate={picker === 'date' && !isEdit ? new Date() : undefined}
            onChange={onPickerChange}
          />
        )}
      </View>
    </Modal>
  );
}
