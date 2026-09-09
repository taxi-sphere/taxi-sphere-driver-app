/**
 * @file: src/schemas/history.schema.ts
 * @description:
 *   Проверка ответа истории заказов.
 *
 *   ПОЧЕМУ ПОЧТИ ВСЁ `nullish` С УМОЛЧАНИЕМ. Приложение и сервер обновляются
 *   врозь: установленная сборка живёт месяцами, а сервер уезжает вперёд —
 *   и наоборот. Строгое поле превратило бы отсутствие одной новой колонки в
 *   пустую историю целиком. Не приходит — считаем «неизвестно», а не ошибка.
 *
 * @dependencies: zod
 * @created: 2026-09-09 (1.5.52)
 */

import { z } from 'zod';

const paymentMethodSchema = z.enum(['cash', 'card', 'bonus']).nullish().default(null);

export const historyOrderSchema = z.object({
  id: z.string(),
  orderNumber: z.number(),
  status: z.enum(['completed', 'canceled']),
  finishedAt: z.string(),
  pickupAddress: z.string(),
  dropoffAddress: z.string().nullish().default(null),
  stopsCount: z.number().nullish().transform((v) => v ?? 0),
  price: z.number().nullish().default(null),
  paymentMethod: paymentMethodSchema,
  distanceM: z.number().nullish().default(null),
  durationSec: z.number().nullish().default(null),
  waitingSec: z.number().nullish().default(null),
  deduction: z.number().nullish().default(null),
  cancelReason: z.string().nullish().default(null),
  serviceName: z.string().nullish().default(null),
  tariffName: z.string().nullish().default(null),
});

export const historyPageSchema = z.object({
  items: z.array(historyOrderSchema),
  nextCursor: z.string().nullish().default(null),
});
