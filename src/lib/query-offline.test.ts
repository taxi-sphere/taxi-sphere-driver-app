/**
 * @file: src/lib/query-offline.test.ts
 * @description:
 *   Что React Query делает без сети — контракт, на котором держатся
 *   `query-bridges.ts` и настройки в `query-client.ts`.
 *
 *   ЗАЧЕМ ЭТОТ ФАЙЛ. Сам модуль мостов протестировать здесь нельзя: он
 *   импортирует `react-native` и NetInfo, а тесты идут в обычном node (см.
 *   шапку vitest.config.mts). Но проверить надо не проводку, а ПОВЕДЕНИЕ,
 *   ради которого её тянули, — и оно целиком в React Query:
 *
 *     1. запрос без сети встаёт на ПАУЗУ, а не падает;
 *     2. при возврате сети он возобновляется САМ, без участия экрана —
 *        ровно это чинили 07.09.2026, когда водитель после обрыва связи
 *        оставался с ошибкой до ручного «Повторить»;
 *     3. клиент обязан быть `mount()`-нут, иначе пункт 2 НЕ РАБОТАЕТ
 *        (в приложении это делает `QueryClientProvider`) — проверено:
 *        без mount запрос остаётся на паузе навсегда;
 *     4. мутация с `networkMode: 'always'` уходит и без сети — действие
 *        водителя должно либо пройти сейчас, либо честно не пройти, а не
 *        выполниться само через три минуты.
 *
 *   Обновление версии React Query может тихо поменять любой из четырёх
 *   пунктов, и заметить это на экране будет нечем.
 *
 * @dependencies: vitest, @tanstack/react-query
 * @created: 2026-09-07 (1.5.38)
 */

import { describe, it, expect, afterEach } from 'vitest';
import { QueryClient, QueryObserver, MutationObserver, onlineManager } from '@tanstack/react-query';

/** Дать очереди микрозадач и таймерам провернуться. */
const tick = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => {
  // onlineManager — глобальный синглтон: невосстановленное состояние
  // утекло бы в соседние тесты.
  onlineManager.setOnline(true);
});

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnReconnect: true },
      mutations: { retry: false, networkMode: 'always' },
    },
  });
}

describe('запрос без сети', () => {
  it('встаёт на паузу, а не падает с ошибкой', async () => {
    onlineManager.setOnline(false);
    const client = makeClient();
    client.mount();

    const observer = new QueryObserver(client, {
      queryKey: ['orders', 'available'],
      queryFn: async () => ({ items: [1, 2] }),
    });
    const unsubscribe = observer.subscribe(() => {});
    await tick();

    const result = observer.getCurrentResult();
    expect(result.fetchStatus).toBe('paused');
    expect(result.isPaused).toBe(true);
    expect(result.error).toBeNull();
    // Именно false: на этом стоит ветка «скелетоны» на экране заказов —
    // бесконечной загрузки без сети не будет.
    expect(result.isLoading).toBe(false);

    unsubscribe();
    client.unmount();
  });

  it('сам возобновляется, когда сеть вернулась', async () => {
    onlineManager.setOnline(false);
    const client = makeClient();
    client.mount();

    const observer = new QueryObserver(client, {
      queryKey: ['orders', 'available'],
      queryFn: async () => ({ items: [1, 2] }),
    });
    const unsubscribe = observer.subscribe(() => {});
    await tick();
    expect(observer.getCurrentResult().data).toBeUndefined();

    onlineManager.setOnline(true);
    await tick(400);

    // Экран ничего не делал и ни на что не нажимал — данные пришли сами.
    expect(observer.getCurrentResult().data).toEqual({ items: [1, 2] });

    unsubscribe();
    client.unmount();
  });

  it('без mount() возобновления НЕ происходит', async () => {
    onlineManager.setOnline(false);
    const client = makeClient();
    // mount() намеренно не вызван — так выглядит клиент вне
    // QueryClientProvider.

    const observer = new QueryObserver(client, {
      queryKey: ['orders', 'available'],
      queryFn: async () => ({ items: [1, 2] }),
    });
    const unsubscribe = observer.subscribe(() => {});
    await tick();

    onlineManager.setOnline(true);
    await tick(400);

    expect(observer.getCurrentResult().data).toBeUndefined();
    expect(observer.getCurrentResult().fetchStatus).toBe('paused');

    unsubscribe();
  });
});

describe('мутация без сети', () => {
  it('с networkMode «always» уходит сразу и честно падает', async () => {
    onlineManager.setOnline(false);
    const client = makeClient();
    client.mount();

    let calls = 0;
    const observer = new MutationObserver(client, {
      mutationFn: async () => {
        calls += 1;
        throw new Error('Network request failed');
      },
    });

    await expect(observer.mutate()).rejects.toThrow('Network request failed');
    // Главное: функция ВЫЗВАЛАСЬ, а не встала в очередь до возврата сети.
    expect(calls).toBe(1);

    client.unmount();
  });

  it('без networkMode «always» встаёт на паузу — то, чего мы не хотим', async () => {
    onlineManager.setOnline(false);
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    client.mount();

    let calls = 0;
    const observer = new MutationObserver(client, {
      mutationFn: async () => {
        calls += 1;
        return { ok: true };
      },
    });

    void observer.mutate();
    await tick();

    // Водитель нажал «Принять» — и ничего не произошло. Заказ примется сам,
    // когда вернётся сеть, в том числе через несколько минут. Ради этого и
    // выставлен networkMode: 'always' в query-client.ts.
    expect(calls).toBe(0);
    expect(observer.getCurrentResult().isPaused).toBe(true);

    client.unmount();
  });
});
