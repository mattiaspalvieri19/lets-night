import { useState, useEffect } from 'react';
import { Modal, View, Text, Pressable, ScrollView, TextInput } from 'react-native';
import {
  CITIES, CATS_NO_TUTTI, MUSIC_TYPES, DRESS_CODES, AGE_TARGETS, TIME_SLOTS,
} from '@lets-night/shared';

const DATE_RANGES = [
  { id: 'all',   label: 'Tutte' },
  { id: 'today', label: 'Oggi' },
  { id: 'week',  label: 'Settimana' },
  { id: 'month', label: 'Mese' },
];

const SORT_OPTIONS = [
  { id: 'date_asc',    label: 'Prossimi prima' },
  { id: 'popular',     label: 'Più popolari' },
  { id: 'price_asc',   label: 'Prezzo ↑' },
  { id: 'price_desc',  label: 'Prezzo ↓' },
];

const ENTRY_OPTIONS = [
  { id: 'any',       label: 'Tutti' },
  { id: 'free',      label: 'Gratis' },
  { id: 'paid',      label: 'A pagamento' },
  { id: 'guestlist', label: 'Lista' },
  { id: 'table',     label: 'Tavolo' },
];

const EMPTY = {
  cities: ['Milano', 'Roma'],
  zone: 'all',
  cats: [],
  dateRange: 'all',
  timeSlot: null,
  priceMin: 0,
  priceMax: 200,
  entryType: 'any',
  musicTypes: [],
  dressCode: null,
  ageTarget: null,
  tags: [],
  sortBy: 'date_asc',
};

function Chip({ label, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
        backgroundColor: active ? '#7C3AED' : '#18181f',
        borderWidth: 1, borderColor: active ? '#7C3AED' : 'rgba(168,85,247,0.2)',
      }}
    >
      <Text style={{ color: active ? '#fff' : '#9CA3AF', fontSize: 12, fontWeight: active ? '700' : '500' }}>
        {label}
      </Text>
    </Pressable>
  );
}

function Section({ title, children }) {
  return (
    <View style={{ marginBottom: 22 }}>
      <Text style={{ color: '#64748B', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>
        {title}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
    </View>
  );
}

export default function AdvancedFiltersModal({
  visible,
  zones = [],
  initial = {},
  onApply,
  onClose,
}) {
  const [state, setState] = useState({ ...EMPTY, ...initial });

  useEffect(() => {
    if (visible) setState({ ...EMPTY, ...initial });
  }, [visible]);

  function toggle(key, value) {
    setState(s => {
      const arr = s[key] || [];
      return { ...s, [key]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] };
    });
  }
  function set(key, value) {
    setState(s => ({ ...s, [key]: value }));
  }

  function resetAll() {
    setState(EMPTY);
  }

  function apply() {
    onApply?.(state);
    onClose?.();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{
          backgroundColor: '#111118',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          maxHeight: '88%',
          borderTopWidth: 1,
          borderColor: 'rgba(168,85,247,0.2)',
        }}>
          {/* Handle + header */}
          <View style={{ alignItems: 'center', paddingTop: 12 }}>
            <View style={{ width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 2 }} />
          </View>
          <View style={{
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            paddingHorizontal: 20, paddingVertical: 14,
            borderBottomWidth: 1, borderColor: 'rgba(168,85,247,0.12)',
          }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>Filtri avanzati</Text>
            <Pressable onPress={resetAll} hitSlop={8}>
              <Text style={{ color: '#A855F7', fontWeight: '700', fontSize: 13 }}>Reset</Text>
            </Pressable>
          </View>

          <ScrollView style={{ paddingHorizontal: 20 }} contentContainerStyle={{ paddingTop: 18, paddingBottom: 20 }}>

            {/* Città */}
            <Section title="Città">
              {CITIES.map(c => (
                <Chip key={c} label={c} active={state.cities.includes(c)}
                  onPress={() => toggle('cities', c)} />
              ))}
            </Section>

            {/* Zona */}
            {zones.length > 1 && (
              <Section title="Zona / Quartiere">
                {zones.map(z => (
                  <Chip key={z} label={z === 'all' ? 'Tutte' : z} active={state.zone === z}
                    onPress={() => set('zone', z)} />
                ))}
              </Section>
            )}

            {/* Data */}
            <Section title="Data">
              {DATE_RANGES.map(d => (
                <Chip key={d.id} label={d.label} active={state.dateRange === d.id}
                  onPress={() => set('dateRange', d.id)} />
              ))}
            </Section>

            {/* Fascia oraria */}
            <Section title="Fascia oraria">
              <Chip label="Qualsiasi" active={!state.timeSlot} onPress={() => set('timeSlot', null)} />
              {TIME_SLOTS.map(t => (
                <Chip key={t.id} label={t.label} active={state.timeSlot === t.id}
                  onPress={() => set('timeSlot', t.id)} />
              ))}
            </Section>

            {/* Tipo evento */}
            <Section title="Tipo evento">
              {CATS_NO_TUTTI.map(c => (
                <Chip key={c} label={c} active={state.cats.includes(c)}
                  onPress={() => toggle('cats', c)} />
              ))}
            </Section>

            {/* Ingresso */}
            <Section title="Ingresso">
              {ENTRY_OPTIONS.map(e => (
                <Chip key={e.id} label={e.label} active={state.entryType === e.id}
                  onPress={() => set('entryType', e.id)} />
              ))}
            </Section>

            {/* Prezzo */}
            <View style={{ marginBottom: 22 }}>
              <Text style={{ color: '#64748B', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>Prezzo (EUR)</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 4 }}>Min</Text>
                  <TextInput value={String(state.priceMin || 0)} onChangeText={v => set('priceMin', parseInt(v.replace(/\D/g, '') || '0', 10))}
                    keyboardType="numeric" placeholderTextColor="#4B5563"
                    style={{ backgroundColor: '#18181f', borderWidth: 1, borderColor: 'rgba(168,85,247,0.2)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#fff' }} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 4 }}>Max</Text>
                  <TextInput value={String(state.priceMax || 0)} onChangeText={v => set('priceMax', parseInt(v.replace(/\D/g, '') || '0', 10))}
                    keyboardType="numeric" placeholderTextColor="#4B5563"
                    style={{ backgroundColor: '#18181f', borderWidth: 1, borderColor: 'rgba(168,85,247,0.2)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#fff' }} />
                </View>
              </View>
            </View>

            {/* Musica */}
            <Section title="Musica">
              {MUSIC_TYPES.map(m => (
                <Chip key={m} label={m} active={state.musicTypes.includes(m)}
                  onPress={() => toggle('musicTypes', m)} />
              ))}
            </Section>

            {/* Dress code */}
            <Section title="Dress code">
              <Chip label="Qualsiasi" active={!state.dressCode} onPress={() => set('dressCode', null)} />
              {DRESS_CODES.map(d => (
                <Chip key={d} label={d} active={state.dressCode === d}
                  onPress={() => set('dressCode', d)} />
              ))}
            </Section>

            {/* Età */}
            <Section title="Età target">
              <Chip label="Qualsiasi" active={!state.ageTarget} onPress={() => set('ageTarget', null)} />
              {AGE_TARGETS.map(a => (
                <Chip key={a} label={a} active={state.ageTarget === a}
                  onPress={() => set('ageTarget', a)} />
              ))}
            </Section>

            {/* Ordinamento */}
            <Section title="Ordina per">
              {SORT_OPTIONS.map(s => (
                <Chip key={s.id} label={s.label} active={state.sortBy === s.id}
                  onPress={() => set('sortBy', s.id)} />
              ))}
            </Section>
          </ScrollView>

          {/* Footer applica */}
          <View style={{
            flexDirection: 'row', gap: 10,
            paddingHorizontal: 20, paddingVertical: 14,
            borderTopWidth: 1, borderColor: 'rgba(168,85,247,0.12)',
          }}>
            <Pressable
              onPress={onClose}
              style={{ flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(168,85,247,0.3)' }}
            >
              <Text style={{ color: '#A855F7', fontWeight: '700', fontSize: 14 }}>Annulla</Text>
            </Pressable>
            <Pressable
              onPress={apply}
              style={{ flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#7C3AED' }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Applica filtri</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
