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

const routeResponseSchema = z.object({
  target: z.enum(['pickup', 'dropoff']),
  /** [lat, lng] в порядке движения. Пусто — у заказа нет координат цели. */
  coordinates: z.array(z.tuple([z.number(), z.number()])),
  distanceMeters: z.number().nullable(),
  durationSeconds: z.number().nullable(),
});

export interface OrderRoute {
  target: 'pickup' | 'dropoff';
  coordinates: Array<{ latitude: number; longitude: number }>;
  distanceMeters: number | null;
  durationSeconds: number | null;
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

  return {
    target: parsed.data.target,
    coordinates: parsed.data.coordinates.map(([latitude, longitude]) => ({
      latitude,
      longitude,
    })),
    distanceMeters: parsed.data.distanceMeters,
    durationSeconds: parsed.data.durationSeconds,
  };
}
