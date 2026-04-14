/**
 * @file: src/hooks/useBalanceTransactions.ts
 * @description:
 *   React Query infinite hook для списка операций с балансом
 *   с cursor-пагинацией. Используется в экране «История операций».
 * @dependencies:
 *   - @tanstack/react-query
 *   - @/api/balance.api
 * @created: 2026-04-14 00:00:00
 * @updated: 2026-04-14 00:00:00
 */

import { useInfiniteQuery } from '@tanstack/react-query';
import { fetchBalanceTransactions } from '@/api/balance.api';
import type { BalanceTransactionType } from '@/types/balance';

const PAGE_SIZE = 30;

export function useBalanceTransactions(
  filter: BalanceTransactionType | 'all' = 'all',
) {
  return useInfiniteQuery({
    queryKey: ['balance', 'transactions', filter],
    queryFn: ({ pageParam }) =>
      fetchBalanceTransactions({
        limit: PAGE_SIZE,
        cursor: pageParam,
        type: filter === 'all' ? null : filter,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined),
    staleTime: 30_000,
  });
}
