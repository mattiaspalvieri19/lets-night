import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@lets-night/shared';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: COLORS.bgElev1,
          borderTopColor: COLORS.borderSubtle,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: '#FAFAFA',
        tabBarInactiveTintColor: COLORS.textDisabled,
        headerStyle: { backgroundColor: COLORS.bg },
        headerTintColor: '#FAFAFA',
        headerTitleStyle: { fontFamily: 'BricolageGrotesque_700Bold', fontSize: 17 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Cerca',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tickets"
        options={{
          title: 'Biglietti',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="ticket-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profilo',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
