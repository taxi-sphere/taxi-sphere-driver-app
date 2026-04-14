/**
 * @file: app/(auth)/_layout.tsx
 * @description:
 *   Layout стека авторизации.
 * @dependencies: expo-router
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
 */

import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#ffffff' },
      }}
    />
  );
}
