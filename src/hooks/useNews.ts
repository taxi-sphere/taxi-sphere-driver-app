/**
 * @file: src/hooks/useNews.ts
 * @description:
 *   Объявления службы и счётчик непрочитанных для бейджа в меню.
 * @dependencies: @tanstack/react-query, @/api/news.api, @/stores/news.store
 * @created: 2026-09-10 (1.5.53)
 */

import { useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getNews } from '@/api/news.api';
import { useNewsStore } from '@/stores/news.store';

export function useNews() {
  const markRead = useNewsStore((s) => s.markRead);
  const setUnreadCount = useNewsStore((s) => s.setUnreadCount);

  const query = useQuery({
    /**
     * Отметка прочтения в ключе НЕ участвует: она меняется при каждом
     * открытии экрана, и попади она в ключ — каждое открытие заводило бы
     * новую запись кэша и перезагружало весь список.
     */
    queryKey: ['news'],
    queryFn: () => getNews({ since: useNewsStore.getState().lastReadAt }),
    /**
     * Пять минут свежести. Объявления пишут единицами в месяц: опрашивать
     * чаще — тратить связь водителя впустую.
     */
    staleTime: 5 * 60_000,
  });

  const markAllRead = useCallback(() => {
    markRead();
    setUnreadCount(0);
  }, [markRead, setUnreadCount]);

  return {
    items: query.data?.items ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    refetch: query.refetch,
    error: query.error,
    markAllRead,
  };
}

/**
 * Сколько объявлений водитель ещё не видел — для бейджа в меню.
 *
 * Отдельный лёгкий запрос: полный список грузится только на экране, а
 * бейдж обязан гореть до того, как водитель туда зашёл. Раз в десять
 * минут — объявления не срочные, чаще незачем.
 */
export function useNewsUnread(): number {
  const setUnreadCount = useNewsStore((s) => s.setUnreadCount);
  const stored = useNewsStore((s) => s.unreadCount);
  const lastReadAt = useNewsStore((s) => s.lastReadAt);

  const { data } = useQuery({
    queryKey: ['news', 'unread', lastReadAt],
    queryFn: () => getNews({ since: lastReadAt }),
    // Не открывал раздел ни разу — считать нечего: подсвечивать все
    // прошлые объявления бессмысленно, а сервер без `since` вернёт ноль.
    enabled: Boolean(lastReadAt),
    refetchInterval: 10 * 60_000,
    staleTime: 5 * 60_000,
  });

  const fromServer = data?.unreadCount;

  useEffect(() => {
    if (fromServer != null) setUnreadCount(fromServer);
  }, [fromServer, setUnreadCount]);

  /**
   * Показываем хранилище, а не ответ сервера: открытие экрана сбрасывает
   * счётчик сразу, иначе бейдж горел бы поверх уже прочитанного до
   * следующего запроса.
   */
  return stored;
}
