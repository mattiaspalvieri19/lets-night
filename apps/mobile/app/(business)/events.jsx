import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, TextInput, Modal, Alert } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { formatDate, formatTime, getPriceLabel, CATS_NO_TUTTI } from '@lets-night/shared';

const EMPTY_EVENT = { title: '', description: '', category: 'Discoteca', event_date: '', event_time: '', price: '', capacity: '', has_tables: false, table_price: '' };
const CATS = CATS_NO_TUTTI;

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function parseNumber(str) {
  if (!str) return null;
  const cleaned = String(str).replace(',', '.').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

export default function BusinessEvents() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [venue, setVenue] = useState(null);
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_EVENT);
  const [saving, setSaving] = useState(false);

  async function loadData() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: v } = await supabase.from('venues').select('id, name, is_verified').eq('owner_id', session.user.id).maybeSingle();
    if (!v) { setLoading(false); return; }
    setVenue(v);
    const { data: evs } = await supabase.from('events').select('*, bookings(id, status)').eq('venue_id', v.id).order('event_date', { ascending: false });
    setEvents(evs || []);
    setLoading(false);
  }

  useFocusEffect(useCallback(() => { loadData(); }, []));
  const onRefresh = useCallback(async () => { setRefreshing(true); await loadData(); setRefreshing(false); }, []);

  async function toggleActive(ev) {
    await supabase.from('events').update({ is_active: !ev.is_active }).eq('id', ev.id);
    loadData();
  }

  async function handleCreate() {
    if (!form.title || !form.event_date || !form.event_time) {
      Alert.alert('Campi mancanti', 'Titolo, data e orario sono obbligatori.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.event_date)) {
      Alert.alert('Data non valida', 'Usa il formato YYYY-MM-DD.');
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(form.event_time)) {
      Alert.alert('Orario non valido', 'Usa il formato HH:MM.');
      return;
    }
    if (form.event_date < todayLocal()) {
      Alert.alert('Data nel passato', 'Non puoi creare un evento per una data passata.');
      return;
    }
    const price = parseNumber(form.price) ?? 0;
    const capacity = form.capacity ? parseInt(String(form.capacity).replace(/\D/g, ''), 10) : null;
    setSaving(true);
    const { error } = await supabase.from('events').insert({
      venue_id: venue.id,
      title: form.title,
      description: form.description,
      category: form.category,
      event_date: form.event_date,
      event_time: form.event_time,
      price,
      capacity: capacity || null,
      has_tables: !!form.has_tables,
      table_price: form.table_price ? parseNumber(form.table_price) : null,
      is_active: true,
    });
    // se has_tables, auto-aggiungi tag 'Tavoli' (idempotente lato DB).
    setSaving(false);
    if (error) { Alert.alert('Errore', error.message); return; }
    closeModal();
    loadData();
  }

  function closeModal() {
    setShowModal(false);
    setForm(EMPTY_EVENT);
  }

  const today = todayLocal();
  const filtered = events.filter(e => {
    // Filtro stato
    if (filter === 'upcoming') {
      if (!(e.event_date >= today && e.is_active)) return false;
    } else if (filter === 'past') {
      if (!(e.event_date < today)) return false;
    } else if (filter === 'draft') {
      if (e.is_active || e.event_date < today) return false;
    } else if (filter === 'soldout') {
      const sold = (e.bookings || []).filter(b => b.status !== 'cancelled' && b.status !== 'denied').length;
      if (!(e.capacity && sold >= e.capacity)) return false;
    }
    // Search interna
    if (search) {
      const q = search.toLowerCase();
      const hay = `${e.title || ''} ${e.category || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const counts = {
    all:      events.length,
    upcoming: events.filter(e => e.event_date >= today && e.is_active).length,
    draft:    events.filter(e => !e.is_active && e.event_date >= today).length,
    past:     events.filter(e => e.event_date < today).length,
    soldout:  events.filter(e => {
      const sold = (e.bookings || []).filter(b => b.status !== 'cancelled' && b.status !== 'denied').length;
      return e.capacity && sold >= e.capacity;
    }).length,
  };

  if (loading) return <View style={{ flex: 1, backgroundColor: '#09090f', justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color="#A855F7" size="large" /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: '#09090f' }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 }}>
        <Pressable
          onPress={() => router.push('/(business)')}
          hitSlop={10}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12, opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={{ color: '#A855F7', fontSize: 16 }}>‹</Text>
          <Text style={{ color: '#A855F7', fontSize: 13, fontWeight: '600' }}>Dashboard</Text>
        </Pressable>
        <Text style={{ color: '#A855F7', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', fontWeight: '600', marginBottom: 4 }}>I tuoi eventi</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700', letterSpacing: -0.3 }}>Gestione eventi</Text>
          {venue?.is_verified && (
            <Pressable onPress={() => setShowModal(true)}
              style={{ backgroundColor: '#A855F7', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 }}>
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 12 }}>+ Nuovo</Text>
            </Pressable>
          )}
        </View>

        {/* Search interna */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: '#18181f', borderRadius: 8,
          borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
          paddingHorizontal: 12, paddingVertical: 8,
          marginTop: 14,
        }}>
          <TextInput
            value={search} onChangeText={setSearch}
            placeholder="Cerca per titolo o categoria..."
            placeholderTextColor="#475569"
            style={{ flex: 1, color: '#fff', fontSize: 13, paddingVertical: 0 }}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={10}>
              <Text style={{ color: '#64748B', fontSize: 16 }}>×</Text>
            </Pressable>
          )}
        </View>

        {/* Filter tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, marginTop: 12 }}>
          {[
            ['all',      'Tutti'],
            ['upcoming', 'Pubblicati'],
            ['draft',    'Bozze'],
            ['past',     'Passati'],
            ['soldout',  'Sold out'],
          ].map(([id, label]) => {
            const active = filter === id;
            return (
              <Pressable key={id} onPress={() => setFilter(id)}
                style={{
                  paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12,
                  backgroundColor: active ? 'rgba(168,85,247,0.15)' : 'transparent',
                  borderWidth: 1,
                  borderColor: active ? '#A855F7' : 'rgba(255,255,255,0.08)',
                }}
              >
                <Text style={{
                  color: active ? '#fff' : '#94A3B8',
                  fontSize: 11,
                  fontWeight: active ? '600' : '500',
                }}>
                  {label} <Text style={{ color: '#475569' }}>({counts[id]})</Text>
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#A855F7" />}>
        {filtered.length === 0 ? (
          <View style={{
            alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24,
            backgroundColor: '#111118', borderRadius: 10,
            borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
          }}>
            <View style={{ width: 32, height: 1, backgroundColor: 'rgba(168,85,247,0.3)', marginBottom: 16 }} />
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 6, textAlign: 'center' }}>
              {events.length === 0 ? 'Non hai ancora creato eventi' : 'Nessun evento per questo filtro'}
            </Text>
            <Text style={{ color: '#64748B', fontSize: 13, textAlign: 'center', marginBottom: events.length === 0 ? 18 : 0 }}>
              {events.length === 0
                ? 'Crea il tuo primo evento per iniziare ad accettare prenotazioni.'
                : 'Cambia filtro o resetta la ricerca.'}
            </Text>
            {events.length === 0 && venue?.is_verified && (
              <Pressable onPress={() => setShowModal(true)}
                style={{ backgroundColor: '#A855F7', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8 }}>
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Crea evento</Text>
              </Pressable>
            )}
          </View>
        ) : filtered.map(ev => {
          const bookingsCount = (ev.bookings || []).filter(b => b.status !== 'cancelled' && b.status !== 'denied').length;
          const isPast = ev.event_date < today;
          return (
            <Pressable
              key={ev.id}
              onPress={() => router.push(`/business-event/${ev.id}`)}
              style={({ pressed }) => ({
                backgroundColor: '#111118', borderRadius: 14, padding: 16, marginBottom: 12,
                borderWidth: 1, borderColor: ev.is_active ? 'rgba(168,85,247,0.2)' : 'rgba(168,85,247,0.06)',
                opacity: isPast ? 0.7 : (pressed ? 0.85 : 1),
              })}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ color: '#A855F7', fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 3 }}>{ev.category}</Text>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15, marginBottom: 4 }} numberOfLines={2}>{ev.title}</Text>
                  <Text style={{ color: '#64748B', fontSize: 12 }}>{formatDate(ev.event_date)} · {formatTime(ev.event_time)}</Text>
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                    <Text style={{ color: '#9CA3AF', fontSize: 12 }}>📋 {bookingsCount} prenotazioni</Text>
                    <Text style={{ color: '#9CA3AF', fontSize: 12 }}>{getPriceLabel(ev.price)}</Text>
                    {ev.capacity && <Text style={{ color: '#9CA3AF', fontSize: 12 }}>👥 {ev.booked_count || 0}/{ev.capacity}</Text>}
                  </View>
                </View>
                {!isPast && (
                  <Pressable onPress={(e) => { e.stopPropagation?.(); toggleActive(ev); }} hitSlop={6}
                    style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: ev.is_active ? 'rgba(74,222,128,0.12)' : 'rgba(100,116,139,0.15)', borderWidth: 1, borderColor: ev.is_active ? 'rgba(74,222,128,0.35)' : 'rgba(100,116,139,0.3)' }}
                  >
                    <Text style={{ color: ev.is_active ? '#4ADE80' : '#64748B', fontSize: 12, fontWeight: '700' }}>
                      {ev.is_active ? 'Attivo' : 'Nascosto'}
                    </Text>
                  </Pressable>
                )}
              </View>
              <Text style={{ color: '#A855F7', fontSize: 11, marginTop: 10, textAlign: 'right' }}>
                Tocca per statistiche →
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Create event modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={closeModal}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={closeModal} />
          <View style={{ backgroundColor: '#111118', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '90%', borderTopWidth: 1, borderColor: 'rgba(168,85,247,0.2)' }}>
            <View style={{ width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 20 }}>Nuovo evento</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {[['Titolo', 'title', 'Es. Saturday Night Fever'], ['Descrizione', 'description', 'Descrivi l\'evento...']].map(([label, key, ph]) => (
                <View key={key} style={{ marginBottom: 14 }}>
                  <Text style={{ color: '#64748B', fontSize: 11, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</Text>
                  <TextInput
                    value={form[key]} onChangeText={v => setForm(f => ({ ...f, [key]: v }))}
                    placeholder={ph} placeholderTextColor="#4B5563"
                    style={{ backgroundColor: '#18181f', borderWidth: 1, borderColor: 'rgba(168,85,247,0.2)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 14 }}
                    multiline={key === 'description'} numberOfLines={key === 'description' ? 3 : 1}
                  />
                </View>
              ))}
              <View style={{ marginBottom: 14 }}>
                <Text style={{ color: '#64748B', fontSize: 11, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Categoria</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {CATS.map(c => (
                      <Pressable key={c} onPress={() => setForm(f => ({ ...f, category: c }))}
                        style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: form.category === c ? '#7C3AED' : '#18181f', borderWidth: 1, borderColor: form.category === c ? '#7C3AED' : 'rgba(168,85,247,0.2)' }}
                      >
                        <Text style={{ color: form.category === c ? '#fff' : '#9CA3AF', fontSize: 13 }}>{c}</Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                {[['Data', 'event_date', 'YYYY-MM-DD'], ['Orario', 'event_time', 'HH:MM']].map(([label, key, ph]) => (
                  <View key={key} style={{ flex: 1 }}>
                    <Text style={{ color: '#64748B', fontSize: 11, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</Text>
                    <TextInput value={form[key]} onChangeText={v => setForm(f => ({ ...f, [key]: v }))} placeholder={ph} placeholderTextColor="#4B5563"
                      style={{ backgroundColor: '#18181f', borderWidth: 1, borderColor: 'rgba(168,85,247,0.2)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 14 }}
                    />
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
                {[['Prezzo (EUR)', 'price', '0'], ['Capienza', 'capacity', 'Illimitata']].map(([label, key, ph]) => (
                  <View key={key} style={{ flex: 1 }}>
                    <Text style={{ color: '#64748B', fontSize: 11, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</Text>
                    <TextInput value={form[key]} onChangeText={v => setForm(f => ({ ...f, [key]: v }))} placeholder={ph} placeholderTextColor="#4B5563" keyboardType="numeric"
                      style={{ backgroundColor: '#18181f', borderWidth: 1, borderColor: 'rgba(168,85,247,0.2)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 14 }}
                    />
                  </View>
                ))}
              </View>
              <Pressable onPress={handleCreate} disabled={saving}
                style={({ pressed }) => ({ backgroundColor: '#7C3AED', paddingVertical: 16, borderRadius: 14, alignItems: 'center', opacity: saving || pressed ? 0.7 : 1, marginBottom: 16 })}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{saving ? 'Pubblicazione...' : 'Pubblica evento'}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
