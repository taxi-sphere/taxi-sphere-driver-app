/**
 * @file: src/hooks/useStageAction.ts
 * @description:
 *   «Я на месте», «Клиент в машине», «Завершить поездку» — с честным исходом
 *   (1.5.65, MOB-081, MOB-087).
 *
 *   ЧТО ИЗМЕНИЛОСЬ. Раньше экран звал `mutate` и на этом всё: при отказе
 *   крутилка гасла, и больше ничего не происходило. Здесь действие ждётся до
 *   конца, отказ сверяется со свежим списком активных заказов и превращается
 *   в слова. Само правило — в `@/lib/order-action-error`, там же тесты.
 *
 *   ОДНО ДЕЙСТВИЕ ЗА РАЗ. Флаг занятости держится с нажатия до конца сверки,
 *   ВКЛЮЧАЯ досылку последних метров перед завершением. До 1.5.65 кнопка во
 *   время `finishMeter` была активна: второе «Завершить» отвязывало первую
 *   мутацию, и карточка с суммой не показывалась.
 *
 * @dependencies: react, react-query, useOrderActions, useCurrentOrder,
 *   orders.api, trip-meter.service, logger.service, @/components/ui,
 *   @/lib/haptics, @/lib/order-action-error
 * @created: 2026-09-14 (1.5.65)
 */

import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getActiveOrders } from '@/api/orders.api';
import { useDialog, useNotify } from '@/components/ui';
import { activeOrdersQueryKey } from '@/hooks/useCurrentOrder';
import { useOrderActions } from '@/hooks/useOrderActions';
import { haptics } from '@/lib/haptics';
import {
  classifyActionError,
  describeActionFailure,
  reconcileActionFailure,
  type StageAction,
} from '@/lib/order-action-error';
import { driverLogger } from '@/services/logger.service';
import { finishMeter } from '@/services/trip-meter.service';
import type { CompleteOrderResponse, CurrentOrder } from '@/types/order';

/**
 * Сколько ждать свежий список заказов для сверки после отказа.
 *
 * Сверка нужна, чтобы не сказать «не прошло» о прошедшем действии, но
 * ждать её дольше нескольких секунд нельзя: водитель смотрит на крутилку.
 * Не успели — исход «неизвестно», и окно всё равно появляется сразу.
 */
const RECONCILE_TIMEOUT_MS = 5_000;

/** Промис, который через `ms` разрешится в `null`, если исходный не успел. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

export interface StageActionControls {
  /** Какое действие идёт сейчас; `null` — ничего не идёт. */
  busy: StageAction | null;
  /**
   * Выполнить действие по заказу.
   *
   * Второй вызов, пока идёт первый, ничего не делает. `onCompleted` —
   * только для завершения: сумма из ответа сервера.
   */
  run: (
    action: StageAction,
    orderId: string,
    onCompleted?: (response: CompleteOrderResponse) => void,
  ) => Promise<void>;
}

export function useStageAction(): StageActionControls {
  const { arrive, start, complete } = useOrderActions();
  // Сами функции у мутаций стабильны — в зависимости берём их, а не
  // объекты мутаций, которые новые на каждом рендере.
  const arriveAsync = arrive.mutateAsync;
  const startAsync = start.mutateAsync;
  const completeAsync = complete.mutateAsync;

  const queryClient = useQueryClient();
  const ask = useDialog();
  const notify = useNotify();

  const [busy, setBusy] = useState<StageAction | null>(null);
  /** Та же занятость, но видна сразу, без ожидания рендера. */
  const busyRef = useRef(false);

  const perform = useCallback(
    async (action: StageAction, orderId: string): Promise<CompleteOrderResponse | null> => {
      if (action === 'arrive') {
        await arriveAsync(orderId);
        return null;
      }
      if (action === 'start') {
        await startAsync(orderId);
        return null;
      }
      /**
       * Последние метры досылаются ДО завершения и именно с ожиданием.
       *
       * Сервер считает итог по показаниям, которые у него есть на момент
       * завершения. Пусти оба запроса наперегонки — и на медленной связи
       * завершение обгонит показания, а последние метры поездки не попадут
       * в чек. `finishMeter` не бросает: не ушло — сервер посчитает по тому,
       * что успел получить, но шанс мы дали.
       */
      await finishMeter(orderId);
      return completeAsync({ orderId });
    },
    [arriveAsync, startAsync, completeAsync],
  );

  const run = useCallback<StageActionControls['run']>(
    async (action, orderId, onCompleted) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(action);
      try {
        // Круг — это кнопка «Повторить» в окне отказа.
        for (;;) {
          try {
            const response = await perform(action, orderId);
            if (response && onCompleted) onCompleted(response);
            return;
          } catch (err) {
            const error = classifyActionError(err);
            /**
             * Свежий список — и для сверки, и чтобы экран сразу показал, что
             * на самом деле с заказом.
             *
             * `networkMode: 'always'` и без повторов — обязательно. Запросы в
             * проекте по умолчанию ждут сеть: без связи такой запрос встаёт
             * на паузу и не завершается, пока связь не вернётся. Поймано на
             * эмуляторе 14.09.2026: в авиарежиме три минуты крутилки и ни
             * одного окна, окно пришло только с возвратом сети.
             */
            const fresh = await withTimeout(
              queryClient.fetchQuery<CurrentOrder[]>({
                queryKey: activeOrdersQueryKey,
                queryFn: getActiveOrders,
                staleTime: 0,
                retry: false,
                networkMode: 'always',
              }),
              RECONCILE_TIMEOUT_MS,
            );
            const outcome = reconcileActionFailure({ action, orderId, fresh });

            driverLogger.warn('Действие по заказу не прошло', {
              screen: 'current',
              action: `order_${action}_failed`,
              extra: { orderId, kind: error.kind, status: error.status, outcome },
            });

            const text = describeActionFailure(action, outcome, error);
            if (!text) return;

            haptics.reject();
            if (!text.canRetry) {
              await notify(text.title, text.message);
              return;
            }
            const choice = await ask({
              title: text.title,
              message: text.message,
              actions: [{ label: 'Повторить', icon: 'refresh' }],
              cancelLabel: 'Закрыть',
            });
            if (choice !== 0) return;
          }
        }
      } finally {
        busyRef.current = false;
        setBusy(null);
      }
    },
    [perform, queryClient, notify, ask],
  );

  return { busy, run };
}
