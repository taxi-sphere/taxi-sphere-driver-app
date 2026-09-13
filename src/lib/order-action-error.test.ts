/**
 * @file: src/lib/order-action-error.test.ts
 * @description:
 *   Исход отказа действия по заказу и слова для водителя.
 *
 *   ЗАЧЕМ. Ошибка здесь стоит водителю либо ложной тревоги («не удалось» по
 *   заказу, у которого всё прошло), либо молчания там, где заказ сняли. Ни
 *   то ни другое не выглядит в журнале как ошибка — поэтому матрица сверки
 *   и тексты проверяются здесь целиком.
 *
 * @dependencies: vitest, @/lib/order-action-error
 * @created: 2026-09-14 (1.5.65)
 */

import { describe, it, expect } from 'vitest';
import {
  ACTION_MUTATION_RETRY,
  classifyActionError,
  describeAcceptFailure,
  describeActionFailure,
  reconcileActionFailure,
  type ActionError,
  type ActionErrorKind,
  type ActionOutcome,
  type StageAction,
} from '@/lib/order-action-error';
import type { OrderStatus } from '@/types/order';

/** Ошибка ky с ответом сервера. */
const http = (status: number, message = 'Текст сервера') =>
  Object.assign(new Error(message), { name: 'HTTPError', response: { status } });

const err = (kind: ActionErrorKind, message: string | null = null): ActionError => ({
  kind,
  status: null,
  message,
});

const one = (status: OrderStatus) => [{ id: 'a', status }];

describe('classifyActionError', () => {
  it('ответ сервера — по коду', () => {
    expect(classifyActionError(http(401)).kind).toBe('unauthorized');
    expect(classifyActionError(http(403)).kind).toBe('forbidden');
    expect(classifyActionError(http(404)).kind).toBe('not_found');
    expect(classifyActionError(http(409)).kind).toBe('conflict');
    expect(classifyActionError(http(429)).kind).toBe('rate_limited');
    expect(classifyActionError(http(500)).kind).toBe('server');
    expect(classifyActionError(http(422)).kind).toBe('rejected');
  });

  it('504 от прокси — тот же «сервер не ответил», что и таймаут', () => {
    expect(classifyActionError(http(504)).kind).toBe('timeout');
  });

  it('таймаут ky и обрыв сети в React Native', () => {
    const timeout = Object.assign(new Error('Request timed out: POST https://srv/api'), {
      name: 'TimeoutError',
    });
    expect(classifyActionError(timeout).kind).toBe('timeout');
    expect(classifyActionError(new TypeError('Network request failed')).kind).toBe('network');
  });

  it('код и текст сервера сохраняются', () => {
    const e = classifyActionError(http(409, 'Сначала завершите текущую поездку'));
    expect(e.status).toBe(409);
    expect(e.message).toBe('Сначала завершите текущую поездку');
  });

  it('не ошибка — unknown, а не падение', () => {
    expect(classifyActionError(null).kind).toBe('unknown');
    expect(classifyActionError('строка').kind).toBe('unknown');
    expect(classifyActionError({ name: 'HTTPError' }).kind).toBe('unknown');
  });
});

describe('reconcileActionFailure — что было на самом деле', () => {
  it('этап уже пройден — действие прошло', () => {
    // Ответ потерялся или нажали дважды: сервер записал этап, а повтор
    // получил 404 «некорректный статус».
    expect(reconcileActionFailure({ action: 'arrive', orderId: 'a', fresh: one('driver_arrived') })).toBe('done');
    expect(reconcileActionFailure({ action: 'arrive', orderId: 'a', fresh: one('in_progress') })).toBe('done');
    expect(reconcileActionFailure({ action: 'start', orderId: 'a', fresh: one('in_progress') })).toBe('done');
  });

  it('заказ на том же этапе — действие действительно не прошло', () => {
    expect(reconcileActionFailure({ action: 'arrive', orderId: 'a', fresh: one('assigned') })).toBe('failed');
    expect(reconcileActionFailure({ action: 'start', orderId: 'a', fresh: one('driver_arrived') })).toBe('failed');
    expect(reconcileActionFailure({ action: 'complete', orderId: 'a', fresh: one('in_progress') })).toBe('failed');
  });

  it('этап откатился — его сдвинул диспетчер', () => {
    expect(reconcileActionFailure({ action: 'start', orderId: 'a', fresh: one('assigned') })).toBe('changed');
    expect(reconcileActionFailure({ action: 'complete', orderId: 'a', fresh: one('driver_arrived') })).toBe('changed');
  });

  it('заказа нет среди активных — снят, отменён или уже завершён', () => {
    expect(reconcileActionFailure({ action: 'arrive', orderId: 'a', fresh: [] })).toBe('gone');
    expect(reconcileActionFailure({ action: 'complete', orderId: 'a', fresh: [] })).toBe('gone');
  });

  it('встречный заказ: сверка по id, а не по первому в списке', () => {
    const fresh = [
      { id: 'other', status: 'in_progress' as const },
      { id: 'a', status: 'assigned' as const },
    ];
    expect(reconcileActionFailure({ action: 'arrive', orderId: 'a', fresh })).toBe('failed');
    expect(reconcileActionFailure({ action: 'arrive', orderId: 'b', fresh })).toBe('gone');
  });

  it('список получить не удалось — прошло ли, неизвестно', () => {
    expect(reconcileActionFailure({ action: 'arrive', orderId: 'a', fresh: null })).toBe('unknown');
  });
});

describe('describeActionFailure — слова для водителя', () => {
  it('действие прошло — окна нет', () => {
    expect(describeActionFailure('arrive', 'done', err('not_found'))).toBeNull();
  });

  it('сессия истекла — окна нет: на экран входа ведёт клиент API', () => {
    expect(describeActionFailure('start', 'failed', err('unauthorized'))).toBeNull();
  });

  it('заказ сняли — сказать и не предлагать повтор', () => {
    const m = describeActionFailure('arrive', 'gone', err('not_found'));
    expect(m?.title).toBe('Заказа больше нет у вас');
    expect(m?.canRetry).toBe(false);
  });

  it('завершение, а заказа уже нет — отправить в «Историю»', () => {
    const m = describeActionFailure('complete', 'gone', err('timeout'));
    expect(m?.title).toBe('Заказ уже закрыт');
    expect(m?.message).toContain('«Истории»');
    expect(m?.canRetry).toBe(false);
  });

  it('этап сдвинул диспетчер — экран обновлён, повтор не нужен', () => {
    const m = describeActionFailure('start', 'changed', err('not_found'));
    expect(m?.message).toContain('Статус заказа изменился');
    expect(m?.canRetry).toBe(false);
  });

  it('нет связи — предложить повтор; заголовок по действию', () => {
    const m = describeActionFailure('start', 'failed', err('network'));
    expect(m?.title).toBe('Поездка не началась');
    expect(m?.message).toContain('«Повторить»');
    expect(m?.canRetry).toBe(true);
  });

  it('409 — текст сервера как есть и без повтора', () => {
    const text = 'Сначала завершите текущую поездку — клиент ещё в машине.';
    const m = describeActionFailure('arrive', 'failed', err('conflict', text));
    expect(m?.message).toBe(text);
    expect(m?.canRetry).toBe(false);
  });

  it('ни в одном окне нет кодов, адресов и английских слов протокола', () => {
    const technical = 'Request failed with status code 500: POST https://srv/api/driver';
    const kinds: ActionErrorKind[] = [
      'network', 'timeout', 'forbidden', 'not_found', 'conflict',
      'rate_limited', 'server', 'rejected', 'unknown',
    ];
    const outcomes: ActionOutcome[] = ['gone', 'changed', 'failed', 'unknown'];
    const actions: StageAction[] = ['arrive', 'start', 'complete'];
    for (const action of actions) {
      for (const outcome of outcomes) {
        for (const kind of kinds) {
          const m = describeActionFailure(action, outcome, err(kind, technical));
          expect(m, `${action}/${outcome}/${kind}`).not.toBeNull();
          expect(m!.message).not.toMatch(/https?:\/\/|status code|Request/i);
        }
      }
    }
  });
});

describe('describeAcceptFailure — заказ не принят', () => {
  it('заказ ушёл другому — текст сервера', () => {
    const m = describeAcceptFailure(err('conflict', 'Заказ уже недоступен'));
    expect(m?.title).toBe('Заказ не принят');
    expect(m?.message).toBe('Заказ уже недоступен');
  });

  it('в окне принятия нет кнопки «Повторить» — ни при какой причине', () => {
    for (const kind of ['network', 'timeout', 'server', 'rate_limited', 'rejected'] as const) {
      const m = describeAcceptFailure(err(kind));
      expect(m?.canRetry, kind).toBe(false);
      expect(m?.message, kind).not.toContain('«Повторить»');
    }
  });

  it('таймаут — отправить проверить вкладку «Заказ»: заказ мог стать нашим', () => {
    expect(describeAcceptFailure(err('timeout'))?.message).toContain('«Заказ»');
  });

  it('сессия истекла — окна нет', () => {
    expect(describeAcceptFailure(err('unauthorized'))).toBeNull();
  });
});

describe('ACTION_MUTATION_RETRY', () => {
  it('действия водителя сами не повторяются', () => {
    // Автоповтор после таймаута и порождал ложную ошибку: первый запрос
    // прошёл, повтор получал 404.
    expect(ACTION_MUTATION_RETRY).toBe(0);
  });
});
