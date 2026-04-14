/**
 * @file: src/providers/AuthProvider.tsx
 * @description:
 *   Провайдер авторизации: загружает токены при старте,
 *   управляет перенаправлением на auth/main.
 * @dependencies: auth.store, expo-router
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
 */

import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useAuthStore } from '@/stores/auth.store';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isReady, hydrate } = useAuthStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const segments = useSegments();
  const router = useRouter();

  // Загрузить токены из SecureStore при старте
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Перенаправление по auth state
  useEffect(() => {
    if (!isReady) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/phone');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(main)/(tabs)/orders');
    }
  }, [isReady, isAuthenticated, segments, router]);

  return <>{children}</>;
}
