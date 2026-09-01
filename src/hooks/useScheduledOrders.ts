/**
 * @file: src/hooks/useScheduledOrders.ts
 * @description:
 *   Предзаказы, назначенные на водителя.
 *
 *   Опрашивается реже, чем список свободных заказов: предзаказ появляется
 *   не «прямо сейчас», и частый опрос ради него — лишний расход батареи и
 *   трафика на смене.
 *
 * @dependencies: orders.api, react-query, driver.store
 * @created: 2026-09-01 (v1.5.17)
 */

import { useQuery } from '@tanstack/react-query';
import { getScheduledOrders } from '@/api/orders.api';
import { useDriverStore } from '@/stores/driver.store';

/** Раз в минуту: предзаказы назначаются диспетчером, а не появляются потоком. */
const SCHEDULED_POLL_MS = 60_000;

export function useScheduledOrders() {
  const status = useDriverStore((s) => s.status);
  const isActive = status !== 'offline';

  return useQuery({
    queryKey: ['orders', 'scheduled'],
    queryFn: getScheduledOrders,
    enabled: isActive,
    staleTime: 30_000,
    refetchInterval: isActive ? SCHEDULED_POLL_MS : false,
  });
}
