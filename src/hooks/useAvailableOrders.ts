/**
 * @file: src/hooks/useAvailableOrders.ts
 * @description:
 *   Hook для получения доступных заказов с polling.
 * @dependencies: orders.api, react-query
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
 */

import { useQuery } from '@tanstack/react-query';
import { getAvailableOrders } from '@/api/orders.api';
import { useDriverStore } from '@/stores/driver.store';
import { ORDERS_POLL_INTERVAL_MS } from '@/lib/constants';
import type { AvailableOrdersMeta } from '@/types/order';

export function useAvailableOrders(radiusKm?: number) {
  const status = useDriverStore((s) => s.status);
  // Заказы видны когда водитель не оффлайн
  const isActive = status !== 'offline';

  const query = useQuery({
    queryKey: ['orders', 'available', radiusKm],
    queryFn: () => getAvailableOrders({ radiusKm }),
    enabled: isActive,
    staleTime: 10_000,
    refetchInterval: isActive ? ORDERS_POLL_INTERVAL_MS : false,
  });

  return {
    ...query,
    data: query.data?.items,
    meta: query.data?.meta as AvailableOrdersMeta | undefined,
  };
}
