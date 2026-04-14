/**
 * @file: src/hooks/useEarnings.ts
 * @description:
 *   Hook для получения статистики заработка.
 * @dependencies: earnings.api, react-query
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
 */

import { useQuery } from '@tanstack/react-query';
import { getEarnings } from '@/api/earnings.api';

export function useEarnings(dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: ['earnings', dateFrom, dateTo],
    queryFn: () => getEarnings({ dateFrom, dateTo }),
    staleTime: 60_000,
  });
}
