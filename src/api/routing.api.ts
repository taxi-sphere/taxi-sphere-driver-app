/**
 * @file: src/api/routing.api.ts
 * @description:
 *   Линия маршрута по дорогам для карты заказа.
 *
 *   ПОЧЕМУ ЧЕРЕЗ СВОЙ СЕРВЕР, А НЕ НАПРЯМУЮ В РОУТЕР. Адрес маршрутизатора —
 *   настройка на сервере (Интеграции → Карты). Зашить её в сборку значит
 *   выпускать новую версию приложения ради смены роутера. Плюс на сервере
 *   стоит кэш маршрутов, а публичный роутер к нагрузке чувствителен.
 *
 *   ТОЧКИ НЕ ПЕРЕДАЮТСЯ. Отправляем id заказа и свою позицию; куда вести —
 *   решает сервер по стадии заказа (до посадки к клиенту, после — к точке
 *   назначения). Так эндпоинт не превращается в бесплатный маршрутизатор.
 *
 * @dependencies: api/client, services/logger.service
 * @created: 2026-09-04 (1.5.36)
 */

import { z } from 'zod';
import { apiPost } from './client';
import { driverLogger } from '@/services/logger.service';

const variantSchema = z.object({
  coordinates: z.array(z.tuple([z.number(), z.number()])),
  distanceMeters: z.number().nullable(),
  durationSeconds: z.number().nullable(),
});

const routeResponseSchema = z.object({
  target: z.enum(['pickup', 'dropoff']),
  /** [lat, lng] в порядке движения. Пусто — у заказа нет координат цели. */
  coordinates: z.array(z.tuple([z.number(), z.number()])),
  distanceMeters: z.number().nullable(),
  durationSeconds: z.number().nullable(),
  /**
   * Варианты пути — сервер v1.100.5+. `default([])`: на сервере старше поля
   * нет, и строгая схема отбраковала бы весь ответ вместе с линией, которая
   * работает с 1.5.36.
   */
  routes: z.array(variantSchema).nullish().default([]),
});

/** Один вариант пути: линия и её цена в километрах и минутах. */
export interface RouteVariant {
  coordinates: { latitude: number; longitude: number }[];
  distanceMeters: number | null;
  durationSeconds: number | null;
}

export interface OrderRoute {
  target: 'pickup' | 'dropoff';
  coordinates: { latitude: number; longitude: number }[];
  distanceMeters: number | null;
  durationSeconds: number | null;
  /**
   * Все варианты, первый — тот же, что в `coordinates`.
   *
   * Пустой массив — сервер старше или роутер отдал один путь. Экран в этом
   * случае ведёт себя как до 1.5.49: одна линия, выбора нет.
   */
  routes: RouteVariant[];
}

/**
 * Маршрут от текущей позиции водителя до цели заказа.
 *
 * Возвращает `null`, если сервер ответил не тем, что мы ждём: карта в этом
 * случае остаётся с метками — это ровно то, что было до появления линии, и
 * ломать из-за неё экран заказа нельзя.
 */
export async function getOrderRoute(input: {
  orderId: string;
  lat: number;
  lng: number;
  /**
   * Опорная точка выбранного водителем пути. Сервер ведёт маршрут через
   * неё — так выбор переживает пересчёт линии каждые 60-110 метров.
   */
  via?: { lat: number; lng: number } | null;
}): Promise<OrderRoute | null> {
  const res = await apiPost('driver/routing', input);
  const parsed = routeResponseSchema.safeParse(res);

  if (!parsed.success) {
    driverLogger.error('Schema validation failed: order route', {
      stack: String(parsed.error?.message ?? parsed.error),
      screen: 'routing.api',
      action: 'parse_order_route',
      extra: { issues: parsed.error?.issues },
    });
    return null;
  }

  const toPoints = (pairs: [number, number][]) =>
    pairs.map(([latitude, longitude]) => ({ latitude, longitude }));

  return {
    target: parsed.data.target,
    coordinates: toPoints(parsed.data.coordinates),
    distanceMeters: parsed.data.distanceMeters,
    durationSeconds: parsed.data.durationSeconds,
    routes: (parsed.data.routes ?? []).map((r) => ({
      coordinates: toPoints(r.coordinates),
      distanceMeters: r.distanceMeters,
      durationSeconds: r.durationSeconds,
    })),
  };
}
