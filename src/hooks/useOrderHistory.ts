/**
 * @file: src/hooks/useOrderHistory.ts
 * @description:
 *   Лента прошлых заказов с подгрузкой по мере прокрутки.
 * @dependencies: @tanstack/react-query, @/api/history.api
 * @created: 2026-09-09 (1.5.52)
 */

import { useInfiniteQuery } from '@tanstack/react-query';
import { fetchOrderHistory } from '@/api/history.api';
import type { HistoryFilter } from '@/types/history';

const PAGE_SIZE = 20;

export function useOrderHistory(filter: HistoryFilter = 'all') {
  return useInfiniteQuery({
    queryKey: ['orders', 'history', filter],
    queryFn: ({ pageParam }) =>
      fetchOrderHistory({ limit: PAGE_SIZE, cursor: pageParam, status: filter }),
    initialPageParam: null as string | null,
    // Курсор `null` означает «дальше ничего нет» — именно так сервер
    // заканчивает ленту, и `undefined` здесь выключает подгрузку.
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    /**
     * Минута свежести. История меняется редко — заказ попадает в неё
     * ровно один раз, — а вот открывать её водитель может по десять раз за
     * смену, сверяясь с расчётом.
     */
    staleTime: 60_000,
  });
}
