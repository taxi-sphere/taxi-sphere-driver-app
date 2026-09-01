/**
 * @file: app/+not-found.tsx
 * @description:
 *   Catch-all экран для несуществующих маршрутов.
 * @dependencies: expo-router, @/components/ui
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-09-01 (v1.5.17 — тема, общий EmptyState)
 */

import { useRouter } from 'expo-router';
import { EmptyState, Screen } from '@/components/ui';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <Screen>
      <EmptyState
        icon="help-circle-outline"
        title="Страница не найдена"
        description="Такого раздела в приложении нет"
        action={{ label: 'На главную', onPress: () => router.replace('/') }}
      />
    </Screen>
  );
}
