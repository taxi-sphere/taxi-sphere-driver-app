/**
 * @file: app/index.tsx
 * @description:
 *   Точка входа: перенаправление на auth или main в зависимости от состояния.
 *   Фактическое перенаправление выполняет AuthProvider.
 * @dependencies: expo-router, @/lib/theme, @/components/ui
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-09-01 (v1.5.17 — тема)
 */

import { ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuthStore } from '@/stores/auth.store';
import { useColors } from '@/lib/theme';
import { Screen } from '@/components/ui';

export default function IndexScreen() {
  const isReady = useAuthStore((s) => s.isReady);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const colors = useColors();

  if (!isReady) {
    return (
      <Screen style={{ justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </Screen>
    );
  }

  if (isAuthenticated) {
    return <Redirect href="/(main)/(tabs)/orders" />;
  }

  return <Redirect href="/(auth)/phone" />;
}
