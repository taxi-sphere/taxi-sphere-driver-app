/**
 * @file: src/api/history.api.ts
 * @description:
 *   История заказов водителя: `GET /api/v1/driver/orders/history`
 *   с курсорной подгрузкой и фильтром по исходу заказа.
 * @dependencies: ./client, @/schemas/history.schema, @/types/history
 * @created: 2026-09-09 (1.5.52)
 */

import { apiGet } from './client';
import { historyPageSchema } from '@/schemas/history.schema';
import { driverLogger } from '@/services/logger.service';
import type { HistoryFilter, HistoryPage } from '@/types/history';

export interface FetchHistoryParams {
  limit?: number;
  cursor?: string | null;
  status?: HistoryFilter;
}

export async function fetchOrderHistory(
  params: FetchHistoryParams = {},
): Promise<HistoryPage> {
  const searchParams: Record<string, string> = {};
  if (params.limit) searchParams.limit = String(params.limit);
  if (params.cursor) searchParams.cursor = params.cursor;
  if (params.status && params.status !== 'all') searchParams.status = params.status;

  const res = await apiGet('driver/orders/history', { searchParams });
  const parsed = historyPageSchema.safeParse(res);

  if (!parsed.success) {
    driverLogger.error('Schema validation failed: order history', {
      stack: String(parsed.error?.message ?? parsed.error),
      screen: 'history.api',
      action: 'parse_history',
      extra: { issues: parsed.error?.issues },
    });
    /**
     * Пустая страница вместо исключения — то же решение, что в
     * `orders.api`. Сломанная запись в истории не повод ронять экран:
     * водитель увидит «пока пусто», а разбор уедет в журнал.
     */
    return { items: [], nextCursor: null };
  }

  return parsed.data;
}
