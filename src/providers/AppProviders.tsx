/**
 * @file: src/providers/AppProviders.tsx
 * @description:
 *   Корневой провайдер: объединяет все провайдеры приложения.
 *
 *   ПОРЯДОК ЗНАЧИМ. `ConfirmDialogProvider` — самый внутренний из всех, кто
 *   держит состояние: его окно рисуется поверх содержимого, и спрашивать
 *   водителя должны уметь и экраны, и провайдеры выше (например, выход из
 *   смены). Обратный порядок оставил бы диалог без доступа к данным, ради
 *   которых его и открывают.
 *
 * @dependencies: react-query, AuthProvider, SocketProvider, LocationProvider,
 *                @/lib/query-bridges,
 *                @/components/ui (ConfirmDialogProvider)
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-09-07 (1.5.38 — мосты React Query к сети и AppState)
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/query-client';
import { installQueryBridges } from '@/lib/query-bridges';
import { installMeterFeed } from '@/services/trip-meter.service';
import { ConfirmDialogProvider } from '@/components/ui';
import { AuthProvider } from './AuthProvider';
import { SocketProvider } from './SocketProvider';
import { LocationProvider } from './LocationProvider';

// До первого рендера: React Query должна узнать о сети и о возврате из фона
// раньше, чем какой-либо экран успеет запросить данные. См. query-bridges —
// без этого вызова `refetchOnReconnect` и `refetchOnWindowFocus` в
// `query-client.ts` не работают вовсе (1.5.38).
installQueryBridges();

/**
 * Счётчик поездки подписывается на поток точек GPS — один раз на модуль,
 * рядом с остальной установкой мостов.
 *
 * Здесь, а не в экране заказа: пробег обязан считаться и когда водитель
 * ушёл на другую вкладку, и когда экран погас. Экран только говорит
 * счётчику, ПО КАКОМУ заказу считать (`setMeterOrder`).
 */
installMeterFeed();

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SocketProvider>
          <LocationProvider>
            <ConfirmDialogProvider>{children}</ConfirmDialogProvider>
          </LocationProvider>
        </SocketProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
