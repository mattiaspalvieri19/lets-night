import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';

export default function DeleteAccountScreen() {
  const { session } = useSession();
  const myId = session?.user?.id;
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (confirm !== 'elimina') return;
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
            // Soft delete: rimuove dati personali + prenotazioni + relazioni sociali
            await Promise.all([
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
              }).eq('id', myId),
              supabase.from('bookings').delete().eq('user_id', myId),
              supabase.from('follows').delete().eq('follower_id', myId),
              supabase.from('follows').delete().eq('following_id', myId),
              supabase.from('favorite_venues').delete().eq('user_id', myId),
            ]);
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
    <ScrollView style={{ flex: 1, backgroundColor: '#09090f' }} contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
      <Text style={{ color: '#F87171', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
        Zona pericolosa
      </Text>
      <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900', marginBottom: 16 }}>
        Elimina account
      </Text>

      <View style={{ backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)', borderRadius: 14, padding: 16, marginBottom: 28 }}>
        <Text style={{ color: '#F87171', fontWeight: '700', fontSize: 14, marginBottom: 8 }}>
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

      <Text style={{ color: '#9CA3AF', fontSize: 14, marginBottom: 18 }}>
        Per confermare scrivi <Text style={{ color: '#fff', fontWeight: '700' }}>elimina</Text> nel campo qui sotto:
      </Text>

      <TextInput
        value={confirm}
        onChangeText={setConfirm}
        placeholder="elimina"
        placeholderTextColor="#4B5563"
        autoCapitalize="none"
        style={{
          backgroundColor: '#18181f', borderWidth: 1,
          borderColor: canDelete ? 'rgba(239,68,68,0.5)' : 'rgba(168,85,247,0.2)',
          borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
          color: '#fff', fontSize: 14, marginBottom: 20,
        }}
      />

      <Pressable
        onPress={handleDelete}
        disabled={!canDelete || loading}
        style={({ pressed }) => ({
          backgroundColor: canDelete ? '#DC2626' : '#374151',
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
        <Text style={{ color: '#64748B', fontSize: 14 }}>Annulla</Text>
      </Pressable>
    </ScrollView>
  );
}
