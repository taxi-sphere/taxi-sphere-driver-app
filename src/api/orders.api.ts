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
  return availableOrdersResponseSchema.parse(res);
}

/** Получить текущий активный заказ */
export async function getCurrentOrder(): Promise<CurrentOrder | null> {
  const res = await apiGet('driver/orders/current');
  const parsed = currentOrderResponseSchema.parse(res);
  return parsed.order;
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
