/**
 * @file: src/hooks/useOrderActions.ts
 * @description:
 *   Hook для мутаций заказа: принять, прибыл, начать, завершить.
 *
 *   v1.5.17: завершение заказа больше не сбрасывает водителя в «online»
 *   безусловно. При встречном заказе активных заказов ДВА, и завершение
 *   первого не означает конец смены — статус выводится из того, остались
 *   ли заказы (`useActiveOrders`), а не назначается здесь.
 *
 * @dependencies: orders.api, react-query, useCurrentOrder (useActiveOrders)
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-09-01 (v1.5.17 — поддержка встречного заказа)
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as ordersApi from '@/api/orders.api';
import { useDriverStore } from '@/stores/driver.store';
import { driverLogger } from '@/services/logger.service';
import { activeOrdersQueryKey } from '@/hooks/useCurrentOrder';
import type { CurrentOrder } from '@/types/order';

/** Типизированный wrapper для логирования ошибок мутации */
function logMutationError(action: string, err: unknown, orderId?: string) {
  const error = err instanceof Error ? err : new Error(String(err));
  driverLogger.error(`Order action failed: ${action} — ${error.message}`, {
    stack: error.stack ?? null,
    screen: 'order',
    action,
    extra: orderId ? { orderId } : null,
  });
}

export function useOrderActions() {
  const queryClient = useQueryClient();
  const setStatus = useDriverStore((s) => s.setStatus);

  const invalidateOrders = () => {
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
  };

  const accept = useMutation({
    mutationFn: ({ orderId, pickupEtaMin }: { orderId: string; pickupEtaMin?: number }) =>
      ordersApi.acceptOrder(orderId, pickupEtaMin),
    onSuccess: (_, vars) => {
      driverLogger.info('Order accepted', {
        action: 'accept_order',
        extra: { orderId: vars.orderId, pickupEtaMin: vars.pickupEtaMin ?? null },
      });
      setStatus('on_order');
      invalidateOrders();
    },
    onError: (err, vars) => logMutationError('accept_order', err, vars.orderId),
  });

  const arrive = useMutation({
    mutationFn: (orderId: string) => ordersApi.arriveOrder(orderId),
    onSuccess: (_, orderId) => {
      driverLogger.info('Driver arrived', { action: 'arrive_order', extra: { orderId } });
      invalidateOrders();
    },
    onError: (err, orderId) => logMutationError('arrive_order', err, orderId),
  });

  const start = useMutation({
    mutationFn: (orderId: string) => ordersApi.startOrder(orderId),
    onSuccess: (_, orderId) => {
      driverLogger.info('Order started', { action: 'start_order', extra: { orderId } });
      invalidateOrders();
    },
    onError: (err, orderId) => logMutationError('start_order', err, orderId),
  });

  const complete = useMutation({
    mutationFn: ({
      orderId,
      finalPrice,
    }: {
      orderId: string;
      finalPrice?: number;
    }) => ordersApi.completeOrder(orderId, finalPrice),
    onSuccess: (_, vars) => {
      driverLogger.info('Order completed', {
        action: 'complete_order',
        extra: { orderId: vars.orderId, finalPrice: vars.finalPrice ?? null },
      });
      // Убираем завершённый заказ из кэша СРАЗУ, чтобы placeholderData не
      // удерживал старые данные и экран не мигал завершённым заказом.
      //
      // Именно убираем один, а не обнуляем весь список: при встречном
      // заказе второй остаётся активным, и водитель должен продолжить его
      // выполнять. Статус тоже больше не назначается здесь — его выведет
      // `useActiveOrders` по тому, остались ли заказы.
      queryClient.setQueryData<CurrentOrder[]>(activeOrdersQueryKey, (prev) =>
        (prev ?? []).filter((order) => order.id !== vars.orderId),
      );
      invalidateOrders();
      void queryClient.invalidateQueries({ queryKey: ['driver', 'profile'] });
      void queryClient.invalidateQueries({ queryKey: ['earnings'] });
    },
    onError: (err, vars) => logMutationError('complete_order', err, vars.orderId),
  });

  return { accept, arrive, start, complete };
}
