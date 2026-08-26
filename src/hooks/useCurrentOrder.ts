/**
 * @file: src/hooks/useCurrentOrder.ts
 * @description:
 *   Hook для получения текущего активного заказа.
 *   Инвалидируется через Socket.IO при изменении статуса.
 *
 *   v1.5.5: подписка на `order:updated` — когда диспетчер поменял
 *   адрес/подъезд/комментарий в админке, водитель видит правки за
 *   <1 сек через сокет вместо ожидания 30-секундного poll'а.
 * @dependencies: orders.api, react-query, driver.store, socket.service
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-08-26 (v1.5.5 — realtime через order:updated)
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCurrentOrder } from '@/api/orders.api';
import type { CurrentOrder } from '@/types/order';
import { useDriverStore } from '@/stores/driver.store';
import { useEffect } from 'react';
import { socketService } from '@/services/socket.service';

export function useCurrentOrder() {
  const status = useDriverStore((s) => s.status);
  const setStatus = useDriverStore((s) => s.setStatus);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['orders', 'current'],
    queryFn: getCurrentOrder,
    staleTime: 5_000,
    gcTime: 60_000,
    refetchInterval: 30_000,
    placeholderData: (prev: CurrentOrder | null | undefined) => prev,
  });

  // v1.5.5: подписка на socket-события правки заказа. Без этого правка
  // адреса у диспетчера доходила через 30 сек (poll refetchInterval).
  useEffect(() => {
    const unsubscribe = socketService.onOrderUpdated(({ orderId }) => {
      const current = queryClient.getQueryData<CurrentOrder | null>(['orders', 'current']);
      // Инвалидируем только если событие про наш текущий заказ.
      // Иначе бесполезно refetch'ить: диспетчер мог править другой заказ,
      // не назначенный этому водителю.
      if (current && orderId === current.id) {
        void queryClient.invalidateQueries({ queryKey: ['orders', 'current'] });
      }
    });
    return unsubscribe;
  }, [queryClient]);

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
