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
 * @updated: 2026-09-10 (1.5.57 — варианты запоминаются, линию можно скрыть)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getOrderRoute, type OrderRoute, type RouteVariant } from '@/api/routing.api';
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
   * Варианты, между которыми водитель выбирает.
   *
   * НЕ `route.routes`, и это важно. После выбора запрос уходит с опорной
   * точкой, а на запрос через промежуточную точку роутер отдаёт РОВНО ОДИН
   * путь — значит `route.routes` после первого же выбора перестаёт быть
   * списком вариантов. Держим последний свободный ответ: только так
   * водитель может ткнуть в соседний вариант и сравнить, а потом вернуться.
   */
  variants: RouteVariant[];
  /** Какой из `variants` ведёт сейчас. 0 — быстрый, он же «выбора нет». */
  chosenIndex: number;
  /**
   * Выбран ли путь водителем вручную. Пока выбора нет, роутер волен
   * предлагать варианты; после выбора он ведёт через опорную точку.
   */
  chosen: boolean;
  /** Выбрать вариант из `variants`. Индекс 0 — сбросить выбор. */
  choose: (index: number) => void;
  /** Линию не рисуем: водитель выбрал «Без маршрута». */
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
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

  /** Какой вариант ведёт сейчас; 0 — быстрый. Хранится рядом с точкой. */
  const [chosenIndex, setChosenIndex] = useState(0);

  /**
   * Варианты с последнего запроса БЕЗ опорной точки — см. `variants` в
   * `OrderRouteState`.
   */
  const [variants, setVariants] = useState<RouteVariant[]>([]);

  /** Водитель убрал линию с карты. */
  const [hidden, setHidden] = useState(false);

  /**
   * Смена заказа или стадии — всё это к ним не относится.
   *
   * Скрытие сбрасывается здесь намеренно: водитель, спрятавший линию по
   * дороге к клиенту, иначе поехал бы без неё и весь путь до места
   * назначения — а туда он как раз дороги может не знать.
   */
  useEffect(() => {
    setAnchor(null);
    setChosenIndex(0);
    setVariants([]);
    setHidden(false);
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
    if (isAnchorPassed(anchor, driver, target)) {
      setAnchor(null);
      // Развилка позади — выбор больше ни к чему не относится, и подсветка
      // на кнопке соврала бы.
      setChosenIndex(0);
    }
  }, [anchor, lat, lng, route]);

  /**
   * Запомнить варианты — только со СВОБОДНОГО ответа.
   *
   * С опорной точкой роутер отдаёт один путь, и записать его сюда значило бы
   * стереть список ровно в тот момент, когда водитель им пользуется.
   */
  useEffect(() => {
    if (anchor) return;
    const list = route?.routes ?? [];
    if (list.length > 0) setVariants(list);
  }, [route, anchor]);

  /**
   * Выбрать вариант.
   *
   * Запоминается не индекс, а ГЕОМЕТРИЯ: точка, которой выбранный путь
   * сильнее всего отличается от быстрого. Почему не индекс и не километраж
   * — разобрано в `@/lib/route-choice`.
   */
  const refetch = query.refetch;

  const choose = useCallback(
    (index: number) => {
      const next =
        index <= 0
          ? null
          : (() => {
              const selected = variants[index];
              const reference = variants[0];
              if (!selected || !reference) return undefined;
              return pickAnchor(selected.coordinates, reference.coordinates);
            })();

      // `undefined` — вариант не найден, ничего не меняем.
      if (next === undefined) return;

      // Выбор пути означает, что путь нужен: держать линию спрятанной после
      // этого было бы издевательством над водителем, который её и выбирает.
      setHidden(false);
      setChosenIndex(index <= 0 ? 0 : index);

      /**
       * СНАЧАЛА ССЫЛКА, ПОТОМ ЗАПРОС, и это не перестраховка.
       *
       * Опорная точка намеренно НЕ входит в ключ запроса (см. выше), поэтому
       * `setAnchor` сам по себе перерисовывает панель, но НЕ перестраивает
       * линию: ключ не изменился, react-query ничего не перезапрашивает.
       * Водитель жал на вариант — и на карте не менялось ничего, пока он не
       * проедет 60-110 метров и ключ не сдвинется сам. Ровно на это и
       * пожаловался владелец 09.09.2026.
       *
       * `refetch` перезапускает `queryFn` с тем же ключом, а тот читает
       * `anchorRef` — значит ссылку надо обновить ДО вызова, не дожидаясь
       * рендера, иначе запрос уйдёт со старой точкой.
       */
      anchorRef.current = next;
      setAnchor(next);
      void refetch();
    },
    [variants, refetch],
  );

  return {
    route,
    variants,
    chosenIndex,
    chosen: anchor != null,
    choose,
    hidden,
    setHidden,
  };
}
