/**
 * @file: src/lib/query-client.ts
 * @description:
 *   Конфигурация React Query клиента.
 *   Глобальный onError для query/mutation — логирует все ошибки
 *   в дашборд через driverLogger (видно в админке → Водители → Логи).
 * @dependencies: @tanstack/react-query, @/services/logger.service
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-09-07 (1.5.38 — refetchOnReconnect/onWindowFocus работают через query-bridges)
 */

import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import { driverLogger } from '@/services/logger.service';

/**
 * Глобальный обработчик ошибок React Query.
 * Ловит ВСЕ ошибки запросов и мутаций, которые не перехвачены локально.
 * Результат виден в админке: Водители → [водитель] → Логи приложения.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
      /**
       * Мутации отправляются ВСЕГДА, даже когда `onlineManager` считает, что
       * сети нет.
       *
       * По умолчанию (`networkMode: 'online'`) мутация без сети не падает, а
       * ВСТАЁТ НА ПАУЗУ и выполняется при возврате связи. Для запросов это
       * ровно то, что нужно, а для действий водителя — нет: он жмёт
       * «Принять заказ», ничего не происходит, и через три минуты заказ
       * принимается сам — когда его уже могли отдать другому, а водитель
       * успел передумать. Действие должно либо пройти сейчас, либо честно
       * не пройти, и водитель должен узнать об этом сразу.
       *
       * До 1.5.38 так и было — просто по случайности: `onlineManager` не был
       * связан с NetInfo и всегда отвечал «онлайн». Связали (см.
       * `query-bridges.ts`) — и это поведение пришлось закрепить явно.
       */
      networkMode: 'always',
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      const key = JSON.stringify(query.queryKey);
      driverLogger.error(`Query failed: ${key} — ${error.message}`, {
        action: `query:${key}`,
        extra: { queryKey: key, errorName: error.name },
      });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      const key = mutation.options.mutationKey
        ? JSON.stringify(mutation.options.mutationKey)
        : 'unknown';
      driverLogger.error(`Mutation failed: ${key} — ${error.message}`, {
        action: `mutation:${key}`,
        extra: { mutationKey: key, errorName: error.name },
      });
    },
  }),
});
