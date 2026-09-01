/**
 * @file: app/(auth)/_layout.tsx
 * @description:
 *   Layout стека авторизации.
 * @dependencies: expo-router, @/lib/theme
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-09-01 (v1.5.17 — тема)
 */

import { Stack } from 'expo-router';
import { useColors } from '@/lib/theme';

export default function AuthLayout() {
  const colors = useColors();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
