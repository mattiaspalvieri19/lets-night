import { useState, useEffect } from 'react';
import { Modal, View, Text, Pressable, ScrollView, TextInput } from 'react-native';
import {
  COLORS, FONT_FAMILY,
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
  { id: 'date_desc',   label: 'Lontani prima' },
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
  cities: [...CITIES],
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

// Chip attiva = bianco pieno + testo scuro (direzione editoriale); inattiva = solo bordo.
function Chip({ label, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
        backgroundColor: active ? COLORS.textPrimary : 'transparent',
        borderWidth: 1,
        borderColor: active ? COLORS.textPrimary : COLORS.borderSubtle,
      }}
    >
      <Text style={{
        color: active ? COLORS.bg : COLORS.textSecondary,
        fontSize: 11,
        fontWeight: active ? '700' : '500',
      }}>
        {label}
      </Text>
    </Pressable>
  );
}

function Section({ title, children }) {
  return (
    <View style={{ marginBottom: 18 }}>
      <Text style={{
        color: COLORS.textMuted,
        fontSize: 10, letterSpacing: 1.5,
        textTransform: 'uppercase',
        fontWeight: '600',
        marginBottom: 8,
      }}>
        {title}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{children}</View>
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
          backgroundColor: COLORS.bgElev1,
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          maxHeight: '88%',
          borderTopWidth: 1,
          borderColor: COLORS.borderSubtle,
        }}>
          {/* Handle + header */}
          <View style={{ alignItems: 'center', paddingTop: 10 }}>
            <View style={{ width: 32, height: 3, backgroundColor: COLORS.borderStrong, borderRadius: 2 }} />
          </View>
          <View style={{
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            paddingHorizontal: 20, paddingVertical: 14,
            borderBottomWidth: 1, borderColor: COLORS.borderSubtle,
          }}>
            <Text style={{ fontFamily: FONT_FAMILY.display, color: COLORS.textPrimary, fontSize: 17, letterSpacing: -0.2 }}>Filtri</Text>
            <Pressable onPress={resetAll} hitSlop={8}>
              <Text style={{ color: COLORS.brand, fontWeight: '600', fontSize: 12 }}>Reset</Text>
            </Pressable>
          </View>

          <ScrollView style={{ paddingHorizontal: 20 }} contentContainerStyle={{ paddingTop: 18, paddingBottom: 20 }}>

            {/* Città — nascosta in modalità single-city (CITIES.length === 1) */}
            {CITIES.length > 1 && (
              <Section title="Città">
                {CITIES.map(c => (
                  <Chip key={c} label={c} active={state.cities.includes(c)}
                    onPress={() => toggle('cities', c)} />
                ))}
              </Section>
            )}

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
            <View style={{ marginBottom: 18 }}>
              <Text style={{ color: COLORS.textMuted, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: '600', marginBottom: 8 }}>Prezzo (EUR)</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  placeholder="Min" value={state.priceMin ? String(state.priceMin) : ''}
                  onChangeText={v => set('priceMin', parseInt(v.replace(/\D/g, '') || '0', 10))}
                  keyboardType="numeric" placeholderTextColor={COLORS.textDisabled}
                  style={{
                    flex: 1, backgroundColor: 'transparent',
                    borderWidth: 1, borderColor: COLORS.borderSubtle,
                    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9,
                    color: COLORS.textPrimary, fontSize: 13,
                  }} />
                <TextInput
                  placeholder="Max" value={state.priceMax ? String(state.priceMax) : ''}
                  onChangeText={v => set('priceMax', parseInt(v.replace(/\D/g, '') || '0', 10))}
                  keyboardType="numeric" placeholderTextColor={COLORS.textDisabled}
                  style={{
                    flex: 1, backgroundColor: 'transparent',
                    borderWidth: 1, borderColor: COLORS.borderSubtle,
                    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9,
                    color: COLORS.textPrimary, fontSize: 13,
                  }} />
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
            borderTopWidth: 1, borderColor: COLORS.borderSubtle,
          }}>
            <Pressable
              onPress={onClose}
              style={{
                flex: 1, paddingVertical: 12, borderRadius: 8,
                alignItems: 'center',
                borderWidth: 1, borderColor: COLORS.borderStrong,
              }}
            >
              <Text style={{ color: COLORS.textSecondary, fontWeight: '600', fontSize: 13 }}>Annulla</Text>
            </Pressable>
            <Pressable
              onPress={apply}
              style={{
                flex: 2, paddingVertical: 12, borderRadius: 8,
                alignItems: 'center', backgroundColor: COLORS.brandStrong,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Applica filtri</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
