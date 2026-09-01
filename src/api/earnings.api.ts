/**
 * @file: src/api/earnings.api.ts
 * @description:
 *   API-вызовы заработка водителя.
 * @dependencies: api/client, schemas/earnings.schema
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-09-01 (v1.5.17 — передаём часовой пояс для разбивки по дням)
 */

import { apiGet } from './client';
import { earningsResponseSchema } from '@/schemas/earnings.schema';
import type { EarningsResponse } from '@/types/earnings';

/** Получить статистику заработка за период */
export async function getEarnings(params?: {
  dateFrom?: string;
  dateTo?: string;
}): Promise<EarningsResponse> {
  const searchParams: Record<string, string> = {};
  if (params?.dateFrom) searchParams.dateFrom = params.dateFrom;
  if (params?.dateTo) searchParams.dateTo = params.dateTo;
  // Часовой пояс устройства — по нему сервер (v1.99.59+) группирует
  // заработок по дням. Без него заказ, завершённый поздно вечером, попадёт
  // в столбик следующего дня: сервер считал бы дни по своему поясу.
  searchParams.tzOffset = String(new Date().getTimezoneOffset());

  const res = await apiGet('driver/earnings', { searchParams });
  return earningsResponseSchema.parse(res);
}
