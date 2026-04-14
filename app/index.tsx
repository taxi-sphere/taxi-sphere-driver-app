/**
 * @file: app/index.tsx
 * @description:
 *   Точка входа: перенаправление на auth или main в зависимости от состояния.
 *   Фактическое перенаправление выполняет AuthProvider.
 * @dependencies: expo-router
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
 */

import { Redirect } from 'expo-router';
import { useAuthStore } from '@/stores/auth.store';
import { ActivityIndicator, View } from 'react-native';

export default function IndexScreen() {
  const isReady = useAuthStore((s) => s.isReady);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  if (isAuthenticated) {
    return <Redirect href="/(main)/(tabs)/orders" />;
  }

  return <Redirect href="/(auth)/phone" />;
}
