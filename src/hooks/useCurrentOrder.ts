/**
 * @file: src/hooks/useCurrentOrder.ts
 * @description:
 *   Hook для получения текущего активного заказа.
 *   Инвалидируется через Socket.IO при изменении статуса.
 * @dependencies: orders.api, react-query, driver.store
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
 */

import { useQuery } from '@tanstack/react-query';
import { getCurrentOrder } from '@/api/orders.api';
import type { CurrentOrder } from '@/types/order';
import { useDriverStore } from '@/stores/driver.store';
import { useEffect } from 'react';

export function useCurrentOrder() {
  const status = useDriverStore((s) => s.status);
  const setStatus = useDriverStore((s) => s.setStatus);

  const query = useQuery({
    queryKey: ['orders', 'current'],
    queryFn: getCurrentOrder,
    staleTime: 5_000,
    gcTime: 60_000,
    refetchInterval: 30_000,
    placeholderData: (prev: CurrentOrder | null | undefined) => prev,
  });

  // Синхронизировать статус водителя с текущим заказом
  useEffect(() => {
    if (query.data) {
      const orderStatus = query.data.status;
      if (
        orderStatus === 'assigned' ||
        orderStatus === 'driver_arrived' ||
        orderStatus === 'in_progress'
      ) {
        if (status !== 'on_order') {
          setStatus('on_order');
        }
      }
    } else if (status === 'on_order') {
      // Нет активного заказа, но статус on_order — переключить на online
      setStatus('online');
    }
  }, [query.data, status, setStatus]);

  return query;
}
