/**
 * @file: src/hooks/useOrderRoute.ts
 * @description:
 *   Линия маршрута для карты заказа.
 *
 *   Ключ запроса и правило «прежняя линия ещё годится» живут в
 *   `@/lib/order-route-key` — там же они и объяснены, и покрыты тестами.
 *   Здесь остаётся только обвязка react-query: этот файл тянет за собой
 *   react-native и потому в тестовой среде не разбирается.
 *
 * @dependencies: react-query, @/api/routing.api, @/lib/order-route-key
 * @created: 2026-09-04 (1.5.36)
 * @updated: 2026-09-07 (1.5.39 — заглушка только пока цель та же)
 */

import { useQuery } from '@tanstack/react-query';
import { getOrderRoute, type OrderRoute } from '@/api/routing.api';
import { isSameRouteTarget, orderRouteKey } from '@/lib/order-route-key';

interface UseOrderRouteParams {
  orderId: string | null | undefined;
  status: string | null | undefined;
  lat: number | null | undefined;
  lng: number | null | undefined;
}

export function useOrderRoute({
  orderId,
  status,
  lat,
  lng,
}: UseOrderRouteParams): OrderRoute | null {
  const enabled = Boolean(orderId) && lat != null && lng != null;

  const query = useQuery({
    queryKey: orderRouteKey({ orderId, status, lat, lng }),
    queryFn: () => getOrderRoute({ orderId: orderId!, lat: lat!, lng: lng! }),
    enabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
    // Пока едет запрос за новым отрезком, показываем прежнюю линию: моргание
    // маршрута на карте раздражает сильнее, чем его лёгкая неактуальность.
    // Но только пока цель та же — см. `isSameRouteTarget`.
    placeholderData: (prev, prevQuery) =>
      isSameRouteTarget(prevQuery?.queryKey, orderId, status) ? prev : undefined,
  });

  return query.data ?? null;
}
