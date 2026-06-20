import { useEffect } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY } from '@lets-night/shared';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';

function Row({ icon, label, sub, onPress, danger }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 14,
        paddingVertical: 14, paddingHorizontal: 16,
        borderBottomWidth: 1, borderBottomColor: COLORS.borderSubtle,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{
        width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
        backgroundColor: danger ? 'rgba(248,113,113,0.12)' : COLORS.brandSubtle,
      }}>
        <Ionicons name={icon} size={18} color={danger ? COLORS.danger : COLORS.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: danger ? COLORS.danger : COLORS.textPrimary, fontSize: 15, fontWeight: '600' }}>{label}</Text>
        {sub ? <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>{sub}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={COLORS.textDisabled} />
    </Pressable>
  );
}

function Section({ title, children }) {
  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={{ color: COLORS.textMuted, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6, paddingHorizontal: 20 }}>
        {title}
      </Text>
      <View style={{ backgroundColor: COLORS.bgElev2, borderRadius: 14, marginHorizontal: 20, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.borderSubtle }}>
        {children}
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const { session, loading } = useSession();

  useEffect(() => {
    if (!loading && !session) router.replace('/auth/login');
  }, [session, loading]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/(tabs)/profile');
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: COLORS.bg }} contentContainerStyle={{ paddingTop: 24, paddingBottom: 48 }}>
      <Text style={{ color: COLORS.brand, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4, paddingHorizontal: 20 }}>
        Account
      </Text>
      <Text style={{ fontFamily: FONT_FAMILY.displayHeavy, color: COLORS.textPrimary, fontSize: 26, marginBottom: 24, paddingHorizontal: 20 }}>
        Impostazioni
      </Text>

      <Section title="Profilo">
        <Row icon="person-outline" label="Modifica profilo" sub="Nome, foto, bio, interessi" onPress={() => router.push('/profile/edit')} />
      </Section>

      <Section title="Preferenze">
        <Row icon="shield-outline" label="Privacy" sub="Visibilità profilo e attività" onPress={() => router.push('/profile/privacy')} />
        <Row icon="notifications-outline" label="Notifiche" sub="Prossimamente" onPress={null} />
      </Section>

      <Section title="Sicurezza">
        <Row icon="lock-closed-outline" label="Cambia password" sub="Aggiorna la tua password" onPress={() => router.push('/settings/password')} />
      </Section>

      <Section title="Account">
        <Row icon="log-out-outline" label="Esci" sub={session?.user?.email} onPress={handleLogout} />
        <Row icon="trash-outline" label="Elimina account" sub="Rimozione definitiva dei dati" onPress={() => router.push('/settings/account')} danger />
      </Section>
    </ScrollView>
  );
}
