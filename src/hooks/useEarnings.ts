/**
 * @file: src/hooks/useEarnings.ts
 * @description:
 *   Статистика заработка за период.
 *
 *   ПЕРИОД ВХОДИТ В КЛЮЧ, ПОЭТОМУ НУЖЕН `placeholderData` (1.5.58). Без него
 *   переключение «Сегодня → Неделя» обнуляло `data`, экран уходил в
 *   полноэкранный скелет — вместе с самим переключателем периода. То есть
 *   водитель, нажавший не туда, не мог нажать обратно, пока не догрузится:
 *   кнопок на экране не было.
 *
 *   С `keepPreviousData` прежние числа остаются на месте, пока едут новые.
 *   Экран решает, как показать их устарелость (`isPlaceholderData`), а
 *   управление остаётся живым. Отдельная «отмена загрузки» при этом не
 *   нужна: нажатие на другой период делает прежний запрос ненужным — это и
 *   есть отмена, только без кнопки.
 *
 * @dependencies: earnings.api, react-query
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-09-11 (1.5.58 — экран не гаснет при смене периода)
 */

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getEarnings } from '@/api/earnings.api';

export function useEarnings(dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: ['earnings', dateFrom, dateTo],
    queryFn: () => getEarnings({ dateFrom, dateTo }),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}
