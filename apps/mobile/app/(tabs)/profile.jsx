import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { formatDate, formatTime } from '@lets-night/shared';

export default function ProfileScreen() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  async function loadData() {
    setLoading(true);
    const { data: { session: s } } = await supabase.auth.getSession();
    setSession(s);

    if (!s) { setLoading(false); return; }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', s.user.id)
      .single();
    setProfile(profileData);

    const { data: bookingsData } = await supabase
      .from('bookings')
      .select('*, events(title, event_date, event_time, venues(name, city))')
      .eq('user_id', s.user.id)
      .order('created_at', { ascending: false });
    setBookings(bookingsData || []);

    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setBookings([]);
  }

  if (loading) {
    return (
      <View className="flex-1 bg-dark items-center justify-center">
        <ActivityIndicator color="#12A0D7" size="large" />
      </View>
    );
  }

  // Non autenticato
  if (!session) {
    return (
      <View className="flex-1 bg-dark px-6 items-center justify-center">
        <View className="w-20 h-20 bg-brand/20 rounded-full items-center justify-center mb-6">
          <Text className="text-brand text-4xl">👤</Text>
        </View>
        <Text className="text-white text-2xl font-bold mb-2">Il tuo profilo</Text>
        <Text className="text-gray-400 text-center mb-10">
          Accedi per vedere le tue prenotazioni e gestire il tuo account.
        </Text>
        <Pressable
          onPress={() => router.push('/auth/login')}
          className="bg-brand rounded-xl py-4 px-10 mb-3 w-full items-center"
        >
          <Text className="text-white font-bold text-base">Accedi</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/auth/register')}
          className="border border-gray-700 rounded-xl py-4 px-10 w-full items-center"
        >
          <Text className="text-white font-semibold text-base">Crea account</Text>
        </Pressable>
      </View>
    );
  }

  // Autenticato
  return (
    <ScrollView className="flex-1 bg-dark">
      {/* Header profilo */}
      <View className="px-5 pt-6 pb-5 border-b border-gray-800">
        <View className="flex-row items-center gap-4">
          <View className="w-16 h-16 bg-brand/20 rounded-full items-center justify-center">
            <Text className="text-brand text-2xl font-bold">
              {(profile?.full_name || session.user.email)?.[0]?.toUpperCase()}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="text-white text-xl font-bold">{profile?.full_name || 'Utente'}</Text>
            <Text className="text-gray-400 text-sm">{session.user.email}</Text>
            {profile?.city && (
              <Text className="text-gray-500 text-sm">{profile.city}</Text>
            )}
          </View>
        </View>

        {/* Statistiche */}
        <View className="flex-row mt-5 gap-4">
          <View className="flex-1 bg-card rounded-xl p-4 items-center">
            <Text className="text-white text-2xl font-bold">{bookings.length}</Text>
            <Text className="text-gray-400 text-xs mt-1">Prenotazioni</Text>
          </View>
          <View className="flex-1 bg-card rounded-xl p-4 items-center">
            <Text className="text-white text-2xl font-bold">
              {bookings.filter(b => b.status === 'confirmed').length}
            </Text>
            <Text className="text-gray-400 text-xs mt-1">Confermate</Text>
          </View>
        </View>
      </View>

      {/* Prenotazioni */}
      <View className="px-5 pt-5">
        <Text className="text-white font-semibold text-base mb-3">Le mie prenotazioni</Text>

        {bookings.length === 0 ? (
          <View className="bg-card rounded-2xl p-8 items-center">
            <Text className="text-gray-400 text-center">Nessuna prenotazione ancora.{'\n'}Esplora gli eventi!</Text>
          </View>
        ) : (
          <View className="gap-3">
            {bookings.map(booking => (
              <View key={booking.id} className="bg-card rounded-xl p-4">
                <View className="flex-row justify-between items-start">
                  <View className="flex-1 mr-3">
                    <Text className="text-white font-semibold" numberOfLines={1}>
                      {booking.events?.title || 'Evento'}
                    </Text>
                    <Text className="text-gray-400 text-sm mt-1">
                      {booking.events?.venues?.name}
                    </Text>
                    <Text className="text-gray-500 text-sm mt-1">
                      {formatDate(booking.events?.event_date)} · {formatTime(booking.events?.event_time)}
                    </Text>
                  </View>
                  <View className={`px-3 py-1 rounded-full ${booking.status === 'confirmed' ? 'bg-green-900/50' : 'bg-gray-800'}`}>
                    <Text className={`text-xs font-semibold ${booking.status === 'confirmed' ? 'text-green-400' : 'text-gray-400'}`}>
                      {booking.status === 'confirmed' ? 'Confermata' : booking.status || 'In attesa'}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Logout */}
      <View className="px-5 mt-8 mb-10">
        <Pressable
          onPress={handleLogout}
          className="border border-red-800 rounded-xl py-4 items-center"
        >
          <Text className="text-red-400 font-semibold">Esci dall&apos;account</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
