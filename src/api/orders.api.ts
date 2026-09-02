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
  orderDetailsResponseSchema,
  availableOrdersResponseSchema,
  currentOrderResponseSchema,
  scheduledOrdersResponseSchema,
} from '@/schemas/order.schema';
import { driverLogger } from '@/services/logger.service';
import type {
  AvailableOrder,
  AvailableOrdersMeta,
  CurrentOrder,
  OrderDetails,
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
  let res: unknown;
  try {
    res = await apiGet('driver/orders/scheduled');
  } catch {
    // Сервер старше приложения — эндпоинт появился в v1.99.59. Пустой
    // список честнее ошибки: предзаказов у водителя действительно нет,
    // просто потому что сервер о них ещё не умеет рассказывать.
    // Приложение обновляется независимо от сервера, так что это штатное
    // сочетание версий, а не сбой.
    return [];
  }

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

/**
 * Детали одного заказа: свободного или своего предзаказа.
 *
 * ПОЧЕМУ ОТДЕЛЬНЫЙ ЗАПРОС, А НЕ ПОИСК ПО СПИСКУ. Экран деталей раньше
 * запрашивал весь `/orders/available` и искал нужный по `id`. Свой
 * предзаказ так не находился никогда — своих заказов в `available` нет по
 * определению, — и экран был недостижим. Сервер отдаёт заказ по
 * идентификатору с v1.99.76.
 */
export async function getOrderDetails(orderId: string): Promise<OrderDetails> {
  const res = await apiGet(`driver/orders/${orderId}`);
  const parsed = orderDetailsResponseSchema.safeParse(res);

  if (!parsed.success) {
    driverLogger.error('Schema validation failed: order details', {
      stack: String(parsed.error?.message ?? parsed.error),
      screen: 'orders.api',
      action: 'parse_order_details',
      extra: { issues: parsed.error?.issues, orderId },
    });
    throw new Error('Не удалось прочитать ответ сервера');
  }

  return parsed.data;
}

/**
 * Подтвердить готовность выполнить предзаказ (DISPATCH-V5).
 *
 * Сервер за N минут до подачи спрашивает водителя, поедет ли он, и ждёт
 * ответа `graceMin` минут. Не дождался — возвращает заказ в общий пул и
 * ищет другого. До 1.5.23 приложение этот эндпоинт не вызывало ни разу.
 *
 * Различаем два отказа: `already_confirmed` — водитель нажал дважды, это не
 * ошибка; `already_expired` — заказ уже ушёл, и об этом надо сказать прямо.
 */
export async function confirmScheduledOrder(
  orderId: string,
): Promise<{ ok: true } | { ok: false; reason: 'expired' | 'unknown'; message: string }> {
  try {
    await apiPost(`driver/orders/${orderId}/confirm-scheduled`, {});
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка соединения';
    const expired = /expired|истек|передан/i.test(message);

    driverLogger.error('Не удалось подтвердить предзаказ', {
      stack: message,
      screen: 'orders.api',
      action: 'confirm_scheduled',
      extra: { orderId },
    });

    return { ok: false, reason: expired ? 'expired' : 'unknown', message };
  }
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

/** Рекомендуемое время подачи (минуты) до точки подачи заказа. */
export interface EtaEstimateResponse {
  etaMin: number;
  distanceKm: number | null;
  provider: '2gis' | 'yandex' | 'haversine';
  usedFallback: boolean;
  /**
   * Время посчитано ЧЕРЕЗ высадку текущего клиента (сервер v1.99.76).
   *
   * Так бывает у встречного заказа: до новой подачи водитель поедет только
   * после того, как высадит первого. Без объяснения рекомендация выглядит
   * завышенной — «тут же десять минут ехать» — и водитель занижает её
   * вручную, обещая второму клиенту то, чего не выполнит.
   */
  viaCurrentTrip?: boolean;
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
