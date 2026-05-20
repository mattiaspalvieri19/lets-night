import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#0a0a0f' },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: 'bold' },
        contentStyle: { backgroundColor: '#0a0a0f' },
      }}
    >
      <Stack.Screen name="login" options={{ title: 'Accedi' }} />
      <Stack.Screen name="register" options={{ title: 'Crea account' }} />
    </Stack>
  );
}
