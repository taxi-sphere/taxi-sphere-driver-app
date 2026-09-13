/**
 * @file: src/lib/route-edit.ts
 * @description:
 *   Какие адреса водитель может поменять в поездке (1.5.61, сервер v1.100.15).
 *
 *   ЗАЧЕМ. Клиент в машине называет другую точку — маршрут надо перестроить
 *   сразу, а не звонить диспетчеру. Решение владельца 13.09.2026: адрес
 *   меняется сразу, диспетчеру приходит сообщение, итоговую цену считает
 *   счётчик.
 *
 *   ПРАВИЛА — ТЕ ЖЕ, ЧТО НА СЕРВЕРЕ (`driver-route-point.ts`). Здесь они нужны,
 *   чтобы не показывать кнопку там, где сервер всё равно откажет:
 *   • только в поездке — до посадки клиента маршрут меняет диспетчер;
 *   • подача не меняется, пройденная точка не меняется;
 *   • конечной точки может не быть («куда — скажет в машине»), тогда её
 *     можно задать.
 *
 *   Точка без `id` (сервер старше v1.100.2) пропускается: адресовать её
 *   нечем, а сервер, у которого нет `id` точек, не умеет и менять адрес.
 *
 * @dependencies: @/types/order
 * @created: 2026-09-13 (1.5.61)
 */

import type { CurrentOrder } from '@/types/order';

/** Какую точку меняем. Промежуточная — по `id`: номер сдвигается при правке маршрута. */
export type RoutePointRef = { kind: 'dropoff' } | { kind: 'stop'; stopId: string };

export interface EditableRoutePoint {
  ref: RoutePointRef;
  /** «Точка 2», «Куда» — теми же словами, что шапка заказа. */
  label: string;
  /** Адрес сейчас. `null` — конечной точки нет. */
  address: string | null;
  entrance: string | null;
  /** Туда водитель едет прямо сейчас — первая непройденная точка. */
  current: boolean;
}

/** Статус, в котором водитель меняет адрес сам. */
export const ROUTE_EDIT_STATUS = 'in_progress';

/**
 * Адреса, которые можно поменять, — по порядку маршрута.
 *
 * Пустой список — менять нечего или ещё рано (клиента нет в машине).
 */
export function editableRoutePoints(
  order: Pick<CurrentOrder, 'status' | 'stops' | 'dropoffAddress' | 'dropoffEntrance'>,
): EditableRoutePoint[] {
  if (order.status !== ROUTE_EDIT_STATUS) return [];

  const points: EditableRoutePoint[] = [];
  (order.stops ?? []).forEach((stop, index) => {
    if (!stop.id || stop.arrivedAt) return;
    points.push({
      ref: { kind: 'stop', stopId: stop.id },
      label: `Точка ${index + 1}`,
      address: stop.address,
      entrance: stop.entrance,
      current: false,
    });
  });

  points.push({
    ref: { kind: 'dropoff' },
    label: 'Куда',
    address: order.dropoffAddress,
    entrance: order.dropoffEntrance,
    current: false,
  });

  const [first] = points;
  if (first) first.current = true;
  return points;
}

/** Ключ точки для навигации между экранами: `dropoff` или `stop:<id>`. */
export function routePointKey(ref: RoutePointRef): string {
  return ref.kind === 'dropoff' ? 'dropoff' : `stop:${ref.stopId}`;
}

/** Обратно из ключа. `null` — ключ битый. */
export function parseRoutePointKey(key: string | null | undefined): RoutePointRef | null {
  if (key === 'dropoff') return { kind: 'dropoff' };
  if (key?.startsWith('stop:') && key.length > 5) return { kind: 'stop', stopId: key.slice(5) };
  return null;
}
