import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Switch } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';

const DEFAULT_PRIVACY = {
  searchable: true,
  profile_visibility: 'public',
  show_future_events: true,
  show_past_events: true,
  show_photos: true,
  show_badges: true,
  show_favorite_venues: true,
  show_followers: true,
  show_following: true,
  notify_followers_on_booking: false, // opt-in: di default non avvisa i follower
};

const TOGGLES = [
  { key: 'searchable',          label: 'Mostrami nei risultati di ricerca', sub: 'Gli altri utenti possono trovarti dalla sezione Cerca' },
  { key: 'show_future_events',  label: 'Mostra serate a cui andrò',          sub: 'Eventi futuri visibili sul tuo profilo' },
  { key: 'notify_followers_on_booking', label: 'Avvisa i follower quando prenoto', sub: 'I tuoi follower ricevono "esce stasera, prenota anche tu" — solo se mostri anche le serate a cui vai' },
  { key: 'show_past_events',    label: 'Mostra serate passate',              sub: 'Eventi a cui sei stato' },
  { key: 'show_photos',         label: 'Mostra foto serate',                 sub: 'Foto caricate dopo gli eventi' },
  { key: 'show_badges',         label: 'Mostra badge',                       sub: 'I traguardi sbloccati appaiono sul profilo' },
  { key: 'show_favorite_venues',label: 'Mostra locali preferiti',            sub: null },
  { key: 'show_followers',      label: 'Mostra follower',                    sub: null },
  { key: 'show_following',      label: 'Mostra chi segui',                   sub: null },
];

export default function PrivacyScreen() {
  const { session } = useSession();
  const myId = session?.user?.id;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_PRIVACY);

  useEffect(() => {
    async function load() {
      if (!myId) { setLoading(false); return; }
      const { data } = await supabase
        .from('profiles').select('privacy_settings')
        .eq('id', myId).maybeSingle();
      if (data?.privacy_settings) {
        setSettings({ ...DEFAULT_PRIVACY, ...data.privacy_settings });
      }
      setLoading(false);
    }
    load();
  }, [myId]);

  async function persist(next) {
    setSettings(next);
    setSaving(true);
    await supabase.from('profiles').update({ privacy_settings: next }).eq('id', myId);
    setSaving(false);
  }

  function toggle(key) {
    const next = { ...settings, [key]: !settings[key] };
    persist(next);
  }

  function setVisibility(value) {
    persist({ ...settings, profile_visibility: value });
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#09090f', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#A855F7" size="large" />
      </View>
    );
  }

  if (!myId) return null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#09090f' }} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={{ padding: 20, paddingTop: 24 }}>
        <Text style={{ color: '#A855F7', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>Impostazioni</Text>
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900', marginBottom: 6 }}>Privacy</Text>
        <Text style={{ color: '#9CA3AF', fontSize: 13, lineHeight: 19, marginBottom: 22 }}>
          Scegli cosa rendere visibile agli altri utenti.
        </Text>

        {/* Profile visibility */}
        <View style={{ marginBottom: 28 }}>
          <Text style={{ color: '#64748B', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>
            Visibilità profilo
          </Text>
          {[
            { id: 'public',  label: 'Pubblico',  desc: 'Chiunque può vedere il tuo profilo' },
            { id: 'followers', label: 'Solo follower', desc: 'Solo chi ti segue vede le tue attività' },
            { id: 'private', label: 'Privato', desc: 'Solo tu vedi le tue attività' },
          ].map(opt => {
            const active = settings.profile_visibility === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => setVisibility(opt.id)}
                style={{
                  flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                  paddingHorizontal: 14, paddingVertical: 14, borderRadius: 12,
                  marginBottom: 8,
                  backgroundColor: active ? 'rgba(124,58,237,0.12)' : '#111118',
                  borderWidth: 1, borderColor: active ? '#7C3AED' : 'rgba(168,85,247,0.12)',
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{opt.label}</Text>
                  <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>{opt.desc}</Text>
                </View>
                <View style={{
                  width: 20, height: 20, borderRadius: 10,
                  borderWidth: 2, borderColor: active ? '#7C3AED' : 'rgba(168,85,247,0.3)',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {active && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#7C3AED' }} />}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Toggle list */}
        <Text style={{ color: '#64748B', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>
          Cosa rendere visibile
        </Text>
        {TOGGLES.map(t => (
          <View
            key={t.key}
            style={{
              flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
              paddingHorizontal: 14, paddingVertical: 14, borderRadius: 12,
              backgroundColor: '#111118',
              borderWidth: 1, borderColor: 'rgba(168,85,247,0.12)',
              marginBottom: 8,
            }}
          >
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>{t.label}</Text>
              {t.sub && <Text style={{ color: '#9CA3AF', fontSize: 11, marginTop: 2, lineHeight: 16 }}>{t.sub}</Text>}
            </View>
            <Switch
              value={!!settings[t.key]}
              onValueChange={() => toggle(t.key)}
              trackColor={{ false: '#27272a', true: '#7C3AED' }}
              thumbColor={settings[t.key] ? '#fff' : '#9CA3AF'}
            />
          </View>
        ))}

        <Text style={{ color: '#64748B', fontSize: 11, textAlign: 'center', marginTop: 20, lineHeight: 17 }}>
          Email e telefono restano sempre privati.{'\n'}I dati di prenotazione non sono mai pubblici.
        </Text>

        {saving && (
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 14 }}>
            <ActivityIndicator color="#A855F7" size="small" />
            <Text style={{ color: '#A855F7', fontSize: 12 }}>Salvataggio...</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
