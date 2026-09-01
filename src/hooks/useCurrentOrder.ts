/**
 * @file: src/hooks/useCurrentOrder.ts
 * @description:
 *   Активные заказы водителя. Обычно один; два — когда взят встречный.
 *
 *   ИМЯ ФАЙЛА УСТАРЕЛО. Хук называется `useActiveOrders` и отдаёт МАССИВ.
 *   Переименовать файл не удалось: в окружении, где велась разработка,
 *   переименование и удаление файлов репозитория запрещены на уровне ОС
 *   (`git mv` → Permission denied). Файл стоит переименовать в
 *   `useActiveOrders.ts` при первой возможности — правки в самом коде для
 *   этого не нужны, только `git mv` и один импорт в `current.tsx`.
 *
 *   ЧТО ИЗМЕНИЛОСЬ В v1.5.17. Раньше хук запрашивал `/orders/current`,
 *   который на сервере сделан через `findFirst` и физически не может
 *   вернуть больше одного заказа. Правило встречных заказов появилось на
 *   сервере в v1.99.58, но показать второй заказ водителю было нечем —
 *   функция не работала от начала до конца.
 *
 *   v1.5.5: подписка на `order:updated` — когда диспетчер поменял
 *   адрес/подъезд/комментарий в админке, водитель видит правки за
 *   <1 сек через сокет вместо ожидания 30-секундного poll'а. Сохранена, но
 *   теперь сверяется со ВСЕМИ активными заказами, а не с одним.
 *
 * @dependencies: orders.api, react-query, driver.store, socket.service
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-09-01 (v1.5.17 — список активных заказов вместо одного)
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getActiveOrders } from '@/api/orders.api';
import type { CurrentOrder } from '@/types/order';
import { useDriverStore } from '@/stores/driver.store';
import { socketService } from '@/services/socket.service';

export const activeOrdersQueryKey = ['orders', 'active'] as const;

export function useActiveOrders() {
  const status = useDriverStore((s) => s.status);
  const setStatus = useDriverStore((s) => s.setStatus);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: activeOrdersQueryKey,
    queryFn: getActiveOrders,
    staleTime: 5_000,
    gcTime: 60_000,
    refetchInterval: 30_000,
    placeholderData: (prev: CurrentOrder[] | undefined) => prev,
  });

  // v1.5.5: подписка на socket-события правки заказа. Без этого правка
  // адреса у диспетчера доходила через 30 сек (poll refetchInterval).
  useEffect(() => {
    const unsubscribe = socketService.onOrderUpdated(({ orderId }) => {
      const orders = queryClient.getQueryData<CurrentOrder[]>(activeOrdersQueryKey);
      // Инвалидируем только если событие про один из НАШИХ заказов.
      // Иначе бесполезно refetch'ить: диспетчер мог править чужой заказ.
      if (orders?.some((o) => o.id === orderId)) {
        void queryClient.invalidateQueries({ queryKey: activeOrdersQueryKey });
      }
    });
    return unsubscribe;
  }, [queryClient]);

  // Статус водителя выводится из наличия активных заказов, а не
  // назначается по месту: при встречном заказе завершение первого не
  // означает конец работы, и «online» там ставить рано.
  useEffect(() => {
    const hasActive = (query.data?.length ?? 0) > 0;
    if (hasActive) {
      if (status !== 'on_order') setStatus('on_order');
    } else if (status === 'on_order') {
      setStatus('online');
    }
  }, [query.data, status, setStatus]);

  return query;
}
