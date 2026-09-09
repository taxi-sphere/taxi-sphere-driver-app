/**
 * @file: src/hooks/useDriverChat.ts
 * @description:
 *   Переписка с диспетчерской: лента, подгрузка старых сообщений,
 *   отправка и отметка прочитанного.
 *
 *   ПОДГРУЗКА ИДЁТ ВВЕРХ, а не вниз, как в остальных списках приложения:
 *   свежее сообщение внизу, старое сверху. Поэтому «следующая страница» —
 *   это то, что БЫЛО РАНЬШЕ самого старого показанного сообщения, и
 *   страницы склеиваются в обратном порядке.
 *
 * @dependencies: @tanstack/react-query, @/api/chat.api, @/stores/chat.store
 * @created: 2026-09-09 (1.5.52)
 */

import { useCallback, useEffect, useMemo } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { fetchChat, sendChatMessage } from '@/api/chat.api';
import { useChatStore } from '@/stores/chat.store';
import type { ChatMessage } from '@/types/chat';

const PAGE_SIZE = 50;

export function useDriverChat() {
  const queryClient = useQueryClient();
  const lastReadAt = useChatStore((s) => s.lastReadAt);
  const markRead = useChatStore((s) => s.markRead);
  const setUnreadCount = useChatStore((s) => s.setUnreadCount);

  const query = useInfiniteQuery({
    /**
     * Отметка прочтения в ключе НЕ участвует намеренно.
     *
     * Она меняется каждый раз, когда водитель открывает экран, и попади
     * она в ключ — каждое открытие заводило бы новую запись кэша и
     * перезагружало всю переписку с нуля. Счётчик непрочитанных приезжает
     * попутно, и небольшое запаздывание ему не вредит: экран открыт,
     * водитель и так всё видит.
     */
    queryKey: ['chat', 'messages'],
    queryFn: ({ pageParam }) =>
      fetchChat({
        limit: PAGE_SIZE,
        before: pageParam,
        since: useChatStore.getState().lastReadAt,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => {
      if (!last.hasMore) return undefined;
      const oldest = last.items[0];
      return oldest ? oldest.createdAt : undefined;
    },
    // Переписка приходит событием сокета, поэтому опрашивать её незачем;
    // полминуты свежести нужны на случай, когда сокет лежал.
    staleTime: 30_000,
  });

  /**
   * Все сообщения в хронологическом порядке.
   *
   * Страницы идут от свежих к старым (первая — последние пятьдесят), а на
   * экране порядок обратный, поэтому страницы разворачиваются, а
   * сообщения внутри страницы — нет: сервер уже отдал их по возрастанию.
   */
  const messages: ChatMessage[] = useMemo(() => {
    const pages = query.data?.pages ?? [];
    return [...pages].reverse().flatMap((p) => p.items);
  }, [query.data]);

  /** Непрочитанные считает сервер — по отметке, которую прислали. */
  const unreadCount = query.data?.pages[0]?.unreadCount ?? 0;

  const send = useMutation({
    mutationFn: (text: string) => sendChatMessage(text),
    onSuccess: () => {
      // Своё сообщение уже прочитано по определению — иначе оно тут же
      // зажгло бы бейдж на собственном вопросе.
      markRead();
      void queryClient.invalidateQueries({ queryKey: ['chat'] });
    },
  });

  /**
   * Отметить переписку прочитанной.
   *
   * Вызывается экраном при открытии и при появлении нового сообщения,
   * пока экран открыт: сообщение, которое водитель видит своими глазами,
   * непрочитанным быть не может.
   */
  const markAllRead = useCallback(() => {
    markRead();
    setUnreadCount(0);
  }, [markRead, setUnreadCount]);

  return {
    messages,
    unreadCount,
    lastReadAt,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
    error: query.error,
    send: send.mutateAsync,
    sending: send.isPending,
    sendError: send.error,
    markAllRead,
  };
}

/**
 * Сколько непрочитанных — для бейджа в меню.
 *
 * ЗАЧЕМ ОТДЕЛЬНЫЙ ЗАПРОС. Полная лента грузится только когда водитель
 * открыл чат, а бейдж обязан гореть и до этого: сообщение могло прийти,
 * пока приложение было закрыто, и события сокета его уже не догонят —
 * Socket.IO пропущенное не переигрывает. Запрос лёгкий: одно последнее
 * сообщение и счёт, который считает сервер.
 *
 * Раз в минуту — на случай, когда сокет лежал; в остальное время счётчик
 * ведёт событие `chat:message`.
 */
export function useChatUnread(): number {
  const setUnreadCount = useChatStore((s) => s.setUnreadCount);
  const stored = useChatStore((s) => s.unreadCount);
  const lastReadAt = useChatStore((s) => s.lastReadAt);

  const { data } = useQuery({
    queryKey: ['chat', 'unread', lastReadAt],
    queryFn: () => fetchChat({ limit: 1, since: lastReadAt }),
    // Не открывал чат ни разу — считать нечего: подсвечивать всю прошлую
    // переписку бессмысленно, а сервер без `since` вернёт ноль.
    enabled: Boolean(lastReadAt),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const fromServer = data?.unreadCount;

  useEffect(() => {
    if (fromServer != null) setUnreadCount(fromServer);
  }, [fromServer, setUnreadCount]);

  /**
   * Показываем ХРАНИЛИЩЕ, а не ответ сервера, хотя ответ точнее.
   *
   * У хранилища три источника: ответ сервера (строка выше), событие
   * сокета (+1) и открытие экрана (сброс в ноль). Верни мы здесь ответ
   * сервера, бейдж продолжал бы гореть после того, как водитель прочитал
   * переписку, — до следующего запроса, то есть до минуты.
   */
  return stored;
}
