import { Stack } from 'expo-router';
import { useI18n } from '../../lib/i18n';

export default function AuthLayout() {
  const { t } = useI18n();
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
      <Stack.Screen name="login" options={{ title: t('auth.login') }} />
      <Stack.Screen name="register" options={{ title: t('auth.createAccount') }} />
      <Stack.Screen name="business-register" options={{ title: t('authBiz.title') }} />
      <Stack.Screen name="callback" options={{ headerShown: false }} />
    </Stack>
  );
}
