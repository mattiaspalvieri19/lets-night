import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#0A0A0C' },
        headerTintColor: '#FAFAFA',
        headerTitleStyle: { fontFamily: 'BricolageGrotesque_700Bold', color: '#FAFAFA', fontSize: 17 },
        contentStyle: { backgroundColor: '#0A0A0C' },
        headerBackButtonDisplayMode: 'minimal',
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="login" options={{ title: 'Accedi' }} />
      <Stack.Screen name="register" options={{ title: 'Crea account' }} />
      <Stack.Screen name="business-register" options={{ title: 'Registra locale' }} />
      <Stack.Screen name="callback" options={{ headerShown: false }} />
    </Stack>
  );
}
