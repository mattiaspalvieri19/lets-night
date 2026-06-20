import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import { COLORS, FONT_FAMILY } from '@lets-night/shared';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';

export default function DeleteAccountScreen() {
  const { session } = useSession();
  const myId = session?.user?.id;
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (confirm !== 'elimina') return;
    if (!myId) {
      Alert.alert('Sessione scaduta', 'Rieffettua il login prima di eliminare l\'account.');
      return;
    }
    Alert.alert(
      'Conferma eliminazione',
      'Tutti i tuoi dati verranno rimossi definitivamente. Questa azione non è reversibile.',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            const results = await Promise.all([
              supabase.from('profiles').update({
                full_name: 'Utente eliminato',
                display_name: null,
                username: null,
                bio: null,
                avatar_url: null,
                phone: null,
                interests: [],
                city: null,
                birth_date: null,
                push_token: null,
              }).eq('id', myId),
              supabase.from('bookings').delete().eq('user_id', myId),
              supabase.from('follows').delete().eq('follower_id', myId),
              supabase.from('follows').delete().eq('following_id', myId),
              supabase.from('favorite_venues').delete().eq('user_id', myId),
            ]);
            const failed = results.find(r => r.error);
            if (failed) {
              setLoading(false);
              Alert.alert('Errore', 'Impossibile eliminare l\'account. Riprova o contatta il supporto.');
              console.error('Errore soft delete:', failed.error);
              return;
            }
            await supabase.auth.signOut();
            setLoading(false);
            router.replace('/(tabs)/profile');
          },
        },
      ]
    );
  }

  const canDelete = confirm === 'elimina';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: COLORS.bg }} contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
      <Text style={{ color: COLORS.danger, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
        Zona pericolosa
      </Text>
      <Text style={{ fontFamily: FONT_FAMILY.displayHeavy, color: COLORS.textPrimary, fontSize: 24, marginBottom: 16 }}>
        Elimina account
      </Text>

      <View style={{ backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)', borderRadius: 14, padding: 16, marginBottom: 28 }}>
        <Text style={{ color: COLORS.danger, fontWeight: '700', fontSize: 14, marginBottom: 8 }}>
          Cosa succede eliminando l&apos;account:
        </Text>
        {[
          'Il profilo non sarà più visibile ad altri utenti',
          'Le prenotazioni attive verranno cancellate',
          'I punti fedeltà e i badge verranno rimossi',
          'I follower e i seguiti verranno rimossi',
        ].map((t, i) => (
          <Text key={i} style={{ color: '#FCA5A5', fontSize: 13, marginBottom: 4 }}>
            · {t}
          </Text>
        ))}
      </View>

      <Text style={{ color: COLORS.textSecondary, fontSize: 14, marginBottom: 18 }}>
        Per confermare scrivi <Text style={{ color: COLORS.textPrimary, fontWeight: '700' }}>elimina</Text> nel campo qui sotto:
      </Text>

      <TextInput
        value={confirm}
        onChangeText={setConfirm}
        placeholder="elimina"
        placeholderTextColor={COLORS.textDisabled}
        autoCapitalize="none"
        style={{
          backgroundColor: COLORS.bgElev3, borderWidth: 1,
          borderColor: canDelete ? 'rgba(239,68,68,0.5)' : COLORS.borderStrong,
          borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
          color: COLORS.textPrimary, fontSize: 14, marginBottom: 20,
        }}
      />

      <Pressable
        onPress={handleDelete}
        disabled={!canDelete || loading}
        style={({ pressed }) => ({
          backgroundColor: canDelete ? '#DC2626' : COLORS.bgElev3,
          borderRadius: 12, paddingVertical: 14, alignItems: 'center',
          opacity: (!canDelete || loading || pressed) ? 0.6 : 1,
        })}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Elimina definitivamente</Text>
        }
      </Pressable>

      <Pressable onPress={() => router.back()} style={{ marginTop: 16, alignItems: 'center' }}>
        <Text style={{ color: COLORS.textMuted, fontSize: 14 }}>Annulla</Text>
      </Pressable>
    </ScrollView>
  );
}
