/**
 * @file: src/api/orders.api.ts
 * @description:
 *   API-вызовы заказов: доступные, текущий, принять, прибыл, начать, завершить.
 * @dependencies: api/client, schemas/order.schema
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
 */

import { apiGet, apiPost } from './client';
import {
  activeOrdersResponseSchema,
  availableOrdersResponseSchema,
  currentOrderResponseSchema,
  scheduledOrdersResponseSchema,
} from '@/schemas/order.schema';
import { driverLogger } from '@/services/logger.service';
import type {
  AvailableOrder,
  AvailableOrdersMeta,
  CurrentOrder,
  AcceptOrderResponse,
  CompleteOrderResponse,
} from '@/types/order';

/** Получить доступные заказы в радиусе */
export async function getAvailableOrders(params?: {
  radiusKm?: number;
  limit?: number;
}): Promise<{ items: AvailableOrder[]; meta?: AvailableOrdersMeta }> {
  const searchParams: Record<string, string> = {};
  if (params?.radiusKm) searchParams.radiusKm = String(params.radiusKm);
  if (params?.limit) searchParams.limit = String(params.limit);

  const res = await apiGet('driver/orders/available', { searchParams });
  const parsed = availableOrdersResponseSchema.safeParse(res);
  if (!parsed.success) {
    driverLogger.error('Schema validation failed: available orders', {
      stack: String(parsed.error?.message ?? parsed.error),
      screen: 'orders.api',
      action: 'parse_available_orders',
      extra: { issues: parsed.error?.issues },
    });
    // Возвращаем пустой список, не роняя приложение
    return { items: [] };
  }
  return parsed.data;
}

/**
 * Предзаказы, назначенные на этого водителя.
 *
 * Отдельный эндпоинт, а не фильтр по доступным: предзаказ уже закреплён за
 * водителем, и в списке свободных заказов ему делать нечего.
 */
export async function getScheduledOrders(): Promise<AvailableOrder[]> {
  const res = await apiGet('driver/orders/scheduled');
  const parsed = scheduledOrdersResponseSchema.safeParse(res);
  if (!parsed.success) {
    driverLogger.error('Schema validation failed: scheduled orders', {
      stack: String(parsed.error?.message ?? parsed.error),
      screen: 'orders.api',
      action: 'parse_scheduled_orders',
      extra: { issues: parsed.error?.issues },
    });
    return [];
  }
  return parsed.data.items;
}

/** Получить текущий активный заказ */
export async function getCurrentOrder(): Promise<CurrentOrder | null> {
  const res = await apiGet('driver/orders/current');
  const parsed = currentOrderResponseSchema.safeParse(res);
  if (!parsed.success) {
    driverLogger.error('Schema validation failed: current order', {
      stack: String(parsed.error?.message ?? parsed.error),
      screen: 'orders.api',
      action: 'parse_current_order',
      extra: { issues: parsed.error?.issues },
    });
    // Не роняем экран, возвращаем null (будет показан «нет заказа»)
    return null;
  }
  return parsed.data.order;
}

/**
 * ВСЕ активные заказы водителя: обычно один, при встречном — два.
 *
 * ЕСТЬ ЗАПАСНОЙ ПУТЬ. Эндпоинт появился на сервере в v1.99.59, а
 * приложение обновляется независимо и вполне может оказаться новее
 * сервера. Если `/orders/active` недоступен — берём одиночный
 * `/orders/current` и оборачиваем в массив: встречный заказ при этом не
 * покажется, но приложение продолжит работать, а не встретит водителя
 * пустым экраном.
 */
export async function getActiveOrders(): Promise<CurrentOrder[]> {
  try {
    const res = await apiGet('driver/orders/active');
    const parsed = activeOrdersResponseSchema.safeParse(res);
    if (parsed.success) return parsed.data.items;

    driverLogger.error('Schema validation failed: active orders', {
      stack: String(parsed.error?.message ?? parsed.error),
      screen: 'orders.api',
      action: 'parse_active_orders',
      extra: { issues: parsed.error?.issues },
    });
  } catch {
    // Старый сервер: молча уходим на /current. Логировать нечего — это
    // штатная работа со сборкой сервера, где эндпоинта ещё нет.
  }

  const current = await getCurrentOrder();
  return current ? [current] : [];
}

/** Принять заказ с указанием времени подачи в минутах */
export async function acceptOrder(
  orderId: string,
  pickupEtaMin?: number,
): Promise<AcceptOrderResponse> {
  return apiPost<AcceptOrderResponse>(
    `driver/orders/${orderId}/accept`,
    pickupEtaMin != null ? { pickupEtaMin } : undefined,
  );
}

/** Рекомендуемое время подачи (минуты) от GPS водителя до точки подачи заказа. */
export interface EtaEstimateResponse {
  etaMin: number;
  distanceKm: number | null;
  provider: '2gis' | 'yandex' | 'haversine';
  usedFallback: boolean;
}

/** Получить рекомендуемое время подачи для заказа (через выбранного провайдера). */
export async function getOrderEtaEstimate(
  orderId: string,
): Promise<EtaEstimateResponse> {
  return apiGet<EtaEstimateResponse>(`driver/orders/${orderId}/eta-estimate`);
}

/** Отметить «прибыл на место» */
export async function arriveOrder(
  orderId: string,
): Promise<{ success: true; message: string }> {
  return apiPost(`driver/orders/${orderId}/arrive`);
}

/** Начать поездку */
export async function startOrder(
  orderId: string,
): Promise<{ success: true; message: string }> {
  return apiPost(`driver/orders/${orderId}/start`);
}

/** Завершить поездку */
export async function completeOrder(
  orderId: string,
  finalPrice?: number,
): Promise<CompleteOrderResponse> {
  return apiPost<CompleteOrderResponse>(
    `driver/orders/${orderId}/complete`,
    finalPrice != null ? { finalPrice } : undefined,
  );
}
