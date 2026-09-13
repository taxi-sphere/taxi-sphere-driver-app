/**
 * @file: src/hooks/useShiftToggle.ts
 * @description:
 *   Одно решение водителя — «беру работу / не беру» — и одно правило для
 *   всех мест, где его принимают.
 *
 *   ЗАЧЕМ ОТДЕЛЬНЫМ ХУКОМ (1.5.61). Правило жило прямо в шапке (`TopBar`):
 *   у водителя ДВА признака — `status` (смена) и `acceptingOrders`
 *   («предлагайте / не предлагайте»), и нажатие обязано привести в
 *   согласованное состояние оба (см. 1.5.51 в шапке `TopBar`). Появилось
 *   второе место — кнопка «Выйти на линию» на пустом списке заказов. Копия
 *   правила там лечила бы только половину, как лечила до 1.5.51 шапка.
 *
 * @dependencies: useDriverStatus, useAcceptingOrders
 * @created: 2026-09-13 (1.5.61)
 */

import { useCallback } from 'react';
import { useDriverStatus } from '@/hooks/useDriverStatus';
import { useAcceptingOrders } from '@/hooks/useAcceptingOrders';
import type { DriverStatus } from '@/types/driver';

export interface ShiftToggle {
  /** Статус смены, как его хранит сервер. */
  status: DriverStatus;
  /**
   * Что показывать водителю: «занят», если верно ЛЮБОЕ из двух — статус
   * «занят» или отметка «не предлагайте». Экран не имеет права говорить
   * «свободен», когда сервер заказов не шлёт.
   */
  effectiveStatus: DriverStatus;
  /** Водитель на заказе — нажатие переключает готовность взять встречный. */
  onOrder: boolean;
  /** Берёт ли водитель новые заказы (на заказе — встречные). */
  accepting: boolean;
  /** Переключить: свободен ↔ занят, с линии — на линию. */
  toggle: () => void;
  /** Идёт запрос — повторное нажатие ничего не сделает. */
  isBusy: boolean;
}

export function useShiftToggle(): ShiftToggle {
  const { status, setStatusTo, isUpdating } = useDriverStatus();
  const accepting = useAcceptingOrders();

  const onOrder = status === 'on_order';
  const effectiveStatus: DriverStatus =
    !onOrder && status === 'online' && !accepting.accepting ? 'busy' : status;

  const { toggle: toggleAccepting, accepting: isAccepting } = accepting;
  const toggle = useCallback(() => {
    // На заказе — только готовность взять встречный: `status` там значит
    // «везёт клиента», и сервер его на заказе не примет.
    if (onOrder) {
      toggleAccepting();
      return;
    }
    // Вне заказа — статус смены И отметка вместе: решение одно, признака два.
    const goingFree = effectiveStatus !== 'online';
    if (isAccepting !== goingFree) toggleAccepting();
    const target: DriverStatus = goingFree ? 'online' : 'busy';
    if (status !== target) setStatusTo(target);
  }, [onOrder, effectiveStatus, isAccepting, toggleAccepting, status, setStatusTo]);

  return {
    status,
    effectiveStatus,
    onOrder,
    accepting: isAccepting,
    toggle,
    isBusy: onOrder ? accepting.isPending : isUpdating || accepting.isPending,
  };
}
