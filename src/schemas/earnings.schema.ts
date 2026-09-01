/**
 * @file: src/schemas/earnings.schema.ts
 * @description:
 *   Zod-схемы для валидации ответов earnings API.
 * @dependencies: zod
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
 */

import { z } from 'zod';

export const earningsResponseSchema = z.object({
  period: z.object({
    totalEarnings: z.number(),
    tripsCount: z.number(),
    averagePrice: z.number(),
    dateFrom: z.string().nullable(),
    dateTo: z.string().nullable(),
  }),
  overall: z.object({
    totalTrips: z.number(),
    totalEarnings: z.number(),
    rating: z.number(),
  }),
  recentOrders: z.array(
    z.object({
      id: z.string(),
      orderNumber: z.string(),
      finalPrice: z.number().nullable(),
      completedAt: z.string(),
      pickupAddress: z.string(),
      dropoffAddress: z.string(),
      paymentMethod: z.string(),
    }),
  ),
  /**
   * Разбивка по дням (сервер v1.99.59+). `nullish` — чтобы приложение
   * работало и со старым сервером, где поля ещё нет.
   */
  daily: z
    .array(
      z.object({
        date: z.string(),
        amount: z.number(),
        trips: z.number(),
      }),
    )
    .nullish(),
});
