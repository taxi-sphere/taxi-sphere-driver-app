/**
 * @file: src/hooks/useOrderRoute.ts
 * @description:
 *   Линия маршрута для карты заказа и выбор варианта пути.
 *
 *   Ключ запроса и правило «прежняя линия ещё годится» живут в
 *   `@/lib/order-route-key`, геометрия выбора — в `@/lib/route-choice`;
 *   там же они объяснены и покрыты тестами. Здесь остаётся обвязка
 *   react-query и хранение выбора: этот файл тянет за собой react-native и
 *   потому в тестовой среде не разбирается.
 *
 * @dependencies: react-query, @/api/routing.api, @/lib/order-route-key,
 *   @/lib/route-choice
 * @created: 2026-09-04 (1.5.36)
 * @updated: 2026-09-09 (1.5.49 — выбор варианта пути, MOB-024)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getOrderRoute, type OrderRoute } from '@/api/routing.api';
import { isSameRouteTarget, orderRouteKey } from '@/lib/order-route-key';
import {
  isAnchorPassed,
  pickAnchor,
  type RoutePoint,
} from '@/lib/route-choice';

interface UseOrderRouteParams {
  orderId: string | null | undefined;
  status: string | null | undefined;
  lat: number | null | undefined;
  lng: number | null | undefined;
}

export interface OrderRouteState {
  /** Линия, которую рисуем сейчас. */
  route: OrderRoute | null;
  /**
   * Выбран ли путь водителем вручную. Пока выбора нет, роутер волен
   * предлагать варианты; после выбора он ведёт через опорную точку.
   */
  chosen: boolean;
  /** Выбрать вариант из `route.routes`. Индекс 0 — сбросить выбор. */
  choose: (index: number) => void;
}

export function useOrderRoute({
  orderId,
  status,
  lat,
  lng,
}: UseOrderRouteParams): OrderRouteState {
  const enabled = Boolean(orderId) && lat != null && lng != null;

  /**
   * Опорная точка выбранного пути.
   *
   * НЕ в ключе запроса: смена точки должна перестроить маршрут, и она это
   * делает через собственное состояние — а вот попади она в ключ, каждый
   * выбор плодил бы новую запись кэша, и прежняя линия переставала бы
   * годиться как заглушка (см. `placeholderData` ниже).
   */
  const [anchor, setAnchor] = useState<RoutePoint | null>(null);
  const anchorRef = useRef<RoutePoint | null>(null);
  anchorRef.current = anchor;

  /** Смена заказа или стадии — выбор к ним не относится. */
  useEffect(() => {
    setAnchor(null);
  }, [orderId, status]);

  const query = useQuery({
    queryKey: orderRouteKey({ orderId, status, lat, lng }),
    queryFn: () =>
      getOrderRoute({
        orderId: orderId!,
        lat: lat!,
        lng: lng!,
        via: anchorRef.current
          ? {
              lat: anchorRef.current.latitude,
              lng: anchorRef.current.longitude,
            }
          : null,
      }),
    enabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
    // Пока едет запрос за новым отрезком, показываем прежнюю линию: моргание
    // маршрута на карте раздражает сильнее, чем его лёгкая неактуальность.
    // Но только пока цель та же — см. `isSameRouteTarget`.
    placeholderData: (prev, prevQuery) =>
      isSameRouteTarget(prevQuery?.queryKey, orderId, status) ? prev : undefined,
  });

  const route = query.data ?? null;

  /**
   * Забыть выбор, когда развилка позади.
   *
   * Без этого опорная точка тянула бы маршрут назад весь остаток поездки:
   * роутер обязан провести через неё, даже если водитель её давно миновал.
   */
  useEffect(() => {
    if (!anchor) return;
    const driver = lat != null && lng != null ? { latitude: lat, longitude: lng } : null;
    const line = route?.coordinates ?? [];
    const target = line.length > 0 ? line[line.length - 1]! : null;
    if (isAnchorPassed(anchor, driver, target)) setAnchor(null);
  }, [anchor, lat, lng, route]);

  /**
   * Выбрать вариант.
   *
   * Запоминается не индекс, а ГЕОМЕТРИЯ: точка, которой выбранный путь
   * сильнее всего отличается от быстрого. Почему не индекс и не километраж
   * — разобрано в `@/lib/route-choice`.
   */
  const choose = useCallback(
    (index: number) => {
      const variants = route?.routes ?? [];
      if (index <= 0) {
        setAnchor(null);
        return;
      }
      const selected = variants[index];
      const reference = variants[0];
      if (!selected || !reference) return;
      setAnchor(pickAnchor(selected.coordinates, reference.coordinates));
    },
    [route],
  );

  return { route, chosen: anchor != null, choose };
}
