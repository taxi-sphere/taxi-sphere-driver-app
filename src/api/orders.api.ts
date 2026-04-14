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
  availableOrdersResponseSchema,
  currentOrderResponseSchema,
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

/** Принять заказ */
export async function acceptOrder(
  orderId: string,
): Promise<AcceptOrderResponse> {
  return apiPost<AcceptOrderResponse>(`driver/orders/${orderId}/accept`);
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
