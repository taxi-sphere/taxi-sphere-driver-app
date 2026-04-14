/**
 * @file: src/hooks/useSocket.ts
 * @description:
 *   Hook для подписки на Socket.IO события в компонентах.
 * @dependencies: socket.service
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
 */

import { useEffect, useRef, useCallback } from 'react';
import { socketService } from '@/services/socket.service';
import type {
  OrderNewEvent,
  OrderStatusEvent,
  OrderCanceledEvent,
} from '@/types/socket-events';

/** Подписка на событие нового заказа */
export function useOnOrderNew(
  callback: (data: OrderNewEvent) => void,
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const handler = (data: OrderNewEvent) => callbackRef.current(data);
    return socketService.onOrderNew(handler);
  }, []);
}

/** Подписка на изменение статуса заказа */
export function useOnOrderStatus(
  callback: (data: OrderStatusEvent) => void,
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const handler = (data: OrderStatusEvent) => callbackRef.current(data);
    return socketService.onOrderStatus(handler);
  }, []);
}

/** Подписка на отмену заказа */
export function useOnOrderCanceled(
  callback: (data: OrderCanceledEvent) => void,
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const handler = (data: OrderCanceledEvent) => callbackRef.current(data);
    return socketService.onOrderCanceled(handler);
  }, []);
}

/** Хелпер — подписка на все события сразу */
export function useSocketEvents(handlers: {
  onOrderNew?: (data: OrderNewEvent) => void;
  onOrderStatus?: (data: OrderStatusEvent) => void;
  onOrderCanceled?: (data: OrderCanceledEvent) => void;
}) {
  const stableNew = useCallback(
    (d: OrderNewEvent) => handlers.onOrderNew?.(d),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const stableStatus = useCallback(
    (d: OrderStatusEvent) => handlers.onOrderStatus?.(d),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const stableCanceled = useCallback(
    (d: OrderCanceledEvent) => handlers.onOrderCanceled?.(d),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useOnOrderNew(stableNew);
  useOnOrderStatus(stableStatus);
  useOnOrderCanceled(stableCanceled);
}
