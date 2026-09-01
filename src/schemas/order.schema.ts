/**
 * @file: src/schemas/order.schema.ts
 * @description:
 *   Zod-схемы для валидации ответов orders API.
 * @dependencies: zod
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
 */

import { z } from 'zod';

const paymentMethodSchema = z.enum(['cash', 'card', 'bonus']).nullable();

const orderStopSchema = z.object({
  address: z.string(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  entrance: z.string().nullable(),
  note: z.string().nullable(),
});

/**
 * Опции заказа (детское кресло, животное и т.п.) — сервер v1.99.64+.
 *
 * `default([])` обязателен: сборки приложения живут дольше сервера и
 * наоборот. Названия уже отфильтрованы сервером — скрытые от водителя
 * опции сюда не попадают, а обезличенные приходят как «Дополнительная
 * опция».
 */
const orderOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const availableOrderSchema = z.object({
  id: z.string(),
  orderNumber: z.number(),
  pickupAddress: z.string(),
  pickupLat: z.number().nullable(),
  pickupLng: z.number().nullable(),
  dropoffAddress: z.string().nullable(),
  dropoffLat: z.number().nullable(),
  dropoffLng: z.number().nullable(),
  estimatedPrice: z.number().nullable(),
  estimatedKm: z.number().nullable(),
  paymentMethod: paymentMethodSchema,
  comment: z.string().nullable(),
  scheduledAt: z.string().nullable(),
  createdAt: z.string().optional(),
  serviceName: z.string().nullable(),
  tariffName: z.string().nullable(),
  stopsCount: z.number(),
  stops: z.array(orderStopSchema).default([]),
  distanceToPickup: z.number().nullable(),
  options: z.array(orderOptionSchema).default([]),
});

/**
 * Мета доступных заказов.
 *
 * Все поля НЕОБЯЗАТЕЛЬНЫЕ намеренно. Строгая схема уже стоила нам живого
 * дефекта: сервер в ветке «водитель занят» присылал только причину отказа,
 * без `effectiveRadius`/`hasGps`, и разбор валил ВЕСЬ ответ — вместе с той
 * самой причиной. Сервер починен (v1.99.59), но приложение обязано
 * переживать неполную мету, а не терять из-за неё всё сообщение.
 */
const availableOrdersMetaSchema = z.object({
  effectiveRadius: z.number().optional(),
  showOrdersWithoutGps: z.boolean().optional(),
  hasGps: z.boolean().optional(),
  /**
   * v1.99.58 на сервере: почему список пуст, если водитель уже занят.
   * Поля необязательные — приложение старше сервера их не увидит, и
   * наоборот, приложение новее сервера не должно из-за них падать.
   */
  blockedReason: z.string().nullish(),
  blockedMessage: z.string().nullish(),
});

export const availableOrdersResponseSchema = z.object({
  items: z.array(availableOrderSchema),
  meta: availableOrdersMetaSchema.optional(),
});

/**
 * Список предзаказов водителя.
 *
 * Форма та же, что у доступных заказов: предзаказ — обычный заказ, у
 * которого заполнено `scheduledAt`. Отдельной схемы он не заслуживает,
 * а расхождение двух схем на одинаковых данных пришлось бы поддерживать.
 */
export const scheduledOrdersResponseSchema = z.object({
  items: z.array(availableOrderSchema),
});

export const currentOrderSchema = z.object({
  id: z.string(),
  orderNumber: z.number(),
  status: z.enum([
    'new',
    'searching',
    'assigned',
    'driver_arrived',
    'in_progress',
    'completed',
    'canceled',
  ]),
  clientPhone: z.string(),
  clientName: z.string().nullable(),
  pickupAddress: z.string(),
  pickupLat: z.number().nullable(),
  pickupLng: z.number().nullable(),
  pickupEntrance: z.string().nullable(),
  pickupNote: z.string().nullable(),
  dropoffAddress: z.string().nullable(),
  dropoffLat: z.number().nullable(),
  dropoffLng: z.number().nullable(),
  dropoffEntrance: z.string().nullable(),
  dropoffNote: z.string().nullable(),
  estimatedPrice: z.number().nullable(),
  estimatedKm: z.number().nullable(),
  estimatedMin: z.number().nullable(),
  paymentMethod: paymentMethodSchema,
  comment: z.string().nullable(),
  createdAt: z.string().optional(),
  assignedAt: z.string().nullable(),
  startedAt: z.string().nullable(),
  serviceName: z.string().nullable(),
  tariffName: z.string().nullable(),
  // default([]) — защита от отсутствия поля в ответе сервера
  stops: z.array(orderStopSchema).default([]),
  options: z.array(orderOptionSchema).default([]),
});

/**
 * Все активные заказы водителя (`GET /driver/orders/active`, сервер
 * v1.99.59+). Обычно один; два — когда взят встречный заказ.
 */
export const activeOrdersResponseSchema = z.object({
  items: z.array(currentOrderSchema),
});

export const currentOrderResponseSchema = z.object({
  order: currentOrderSchema.nullable(),
});
