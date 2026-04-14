/**
 * @file: src/api/balance.api.ts
 * @description:
 *   API-клиент для истории операций с балансом водителя.
 *   GET /api/v1/driver/balance-transactions с фильтром по типу и
 *   cursor-пагинацией.
 * @dependencies:
 *   - ./client
 *   - @/types/balance
 * @created: 2026-04-14 00:00:00
 * @updated: 2026-04-14 00:00:00
 */

import { apiGet } from './client';
import type {
  BalanceTransactionType,
  BalanceTransactionsResponse,
} from '@/types/balance';

export interface FetchTransactionsParams {
  limit?: number;
  cursor?: string | null;
  type?: BalanceTransactionType | null;
  from?: string | null;
  to?: string | null;
}

export async function fetchBalanceTransactions(
  params: FetchTransactionsParams = {},
): Promise<BalanceTransactionsResponse> {
  const search = new URLSearchParams();
  if (params.limit) search.set('limit', String(params.limit));
  if (params.cursor) search.set('cursor', params.cursor);
  if (params.type) search.set('type', params.type);
  if (params.from) search.set('from', params.from);
  if (params.to) search.set('to', params.to);

  const qs = search.toString();
  const path = `driver/balance-transactions${qs ? `?${qs}` : ''}`;
  return apiGet<BalanceTransactionsResponse>(path);
}
