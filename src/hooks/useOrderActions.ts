/**
 * @file: src/hooks/useOrderActions.ts
 * @description:
 *   Hook для мутаций заказа: принять, прибыл, начать, завершить.
 * @dependencies: orders.api, react-query
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as ordersApi from '@/api/orders.api';
import { useDriverStore } from '@/stores/driver.store';
import { driverLogger } from '@/services/logger.service';

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
      // Сбрасываем кэш текущего заказа СРАЗУ, чтобы placeholderData
      // не удерживал старые данные и useCurrentOrder не дёргал статус обратно
      queryClient.setQueryData(['orders', 'current'], null);
      setStatus('online');
      invalidateOrders();
      void queryClient.invalidateQueries({ queryKey: ['driver', 'profile'] });
      void queryClient.invalidateQueries({ queryKey: ['earnings'] });
    },
    onError: (err, vars) => logMutationError('complete_order', err, vars.orderId),
  });

  return { accept, arrive, start, complete };
}
