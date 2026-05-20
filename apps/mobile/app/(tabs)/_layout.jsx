import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: { backgroundColor: '#0a0a0f', borderTopColor: '#1a1a2e' },
        tabBarActiveTintColor: '#12A0D7',
        tabBarInactiveTintColor: '#555577',
        headerStyle: { backgroundColor: '#0a0a0f' },
        headerTintColor: '#ffffff',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Scopri', tabBarIcon: ({ color }) => null }}
      />
      <Tabs.Screen
        name="explore"
        options={{ title: 'Esplora', tabBarIcon: ({ color }) => null }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profilo', tabBarIcon: ({ color }) => null }}
      />
    </Tabs>
  );
}
