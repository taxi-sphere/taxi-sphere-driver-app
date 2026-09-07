/**
 * @file: src/hooks/useOrderRoute.ts
 * @description:
 *   Линия маршрута для карты заказа.
 *
 *   ЗАЧЕМ ОГРУБЛЯЕТСЯ КЛЮЧ. Позиция приходит раз в 5 секунд, и запрашивать
 *   маршрут на каждую точку значит бить в маршрутизатор двенадцать раз в
 *   минуту на каждого водителя — ради линии, которая за пять секунд не
 *   меняется. Ключ округляется до трёх знаков (примерно 60–110 метров), и
 *   пока водитель не проехал этот шаг, react-query отдаёт готовый ответ.
 *   Тем же приёмом это решено на карте диспетчера (v1.99.52).
 *
 *   ЗАЧЕМ В КЛЮЧЕ СТАТУС. Цель зависит от стадии: до посадки ведём к
 *   клиенту, после — к точке назначения. Без статуса в ключе линия осталась
 *   бы вести к клиенту, которого водитель уже везёт.
 *
 * @dependencies: react-query, api/routing.api
 * @created: 2026-09-04 (1.5.36)
 */

import { useQuery } from '@tanstack/react-query';
import { getOrderRoute, type OrderRoute } from '@/api/routing.api';

/** Шаг огрубления координат в ключе запроса: 3 знака ≈ 60–110 м. */
const KEY_PRECISION = 3;

interface UseOrderRouteParams {
  orderId: string | null | undefined;
  status: string | null | undefined;
  lat: number | null | undefined;
  lng: number | null | undefined;
}

export function useOrderRoute({
  orderId,
  status,
  lat,
  lng,
}: UseOrderRouteParams): OrderRoute | null {
  const enabled = Boolean(orderId) && lat != null && lng != null;

  const query = useQuery({
    queryKey: [
      'order-route',
      orderId,
      status,
      lat != null ? lat.toFixed(KEY_PRECISION) : null,
      lng != null ? lng.toFixed(KEY_PRECISION) : null,
    ],
    queryFn: () => getOrderRoute({ orderId: orderId!, lat: lat!, lng: lng! }),
    enabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
    // Пока едет запрос за новым отрезком, показываем прежнюю линию: моргание
    // маршрута на карте раздражает сильнее, чем его лёгкая неактуальность.
    placeholderData: (prev: OrderRoute | null | undefined) => prev,
  });

  return query.data ?? null;
}
