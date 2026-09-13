/**
 * @file: src/lib/order-action-error.ts
 * @description:
 *   Что сказать водителю, когда действие по заказу не прошло (1.5.65).
 *
 *   ЗАЧЕМ. До 1.5.65 «Я на месте», «Клиент в машине» и «Завершить» падали
 *   молча: крутилка на кнопке гасла, и всё. Ошибка уходила только в журнал
 *   — `mutate` из react-query сам глотает её, поэтому обработчик с окном на
 *   экране не срабатывал ни разу. Водитель жал снова, не зная, что заказ
 *   давно снят диспетчером или что пропала связь.
 *
 *   ПОЧЕМУ НЕ ПРОСТО ПОКАЗАТЬ ТЕКСТ ОШИБКИ. Отказ не всегда значит «не
 *   прошло». Ответ мог потеряться по дороге, когда сервер уже записал этап;
 *   повторное нажатие того же действия сервер отвергает тем же 404, что и
 *   отменённый заказ. Скажи на это «не удалось» — водитель поверит и начнёт
 *   звонить диспетчеру по заказу, у которого всё в порядке. Поэтому сначала
 *   сверка со свежим списком активных заказов (`reconcileActionFailure`), и
 *   только потом — слова (`describeActionFailure`).
 *
 *   ПОВТОРОВ НЕТ. Автоповтор мутации после таймаута и порождал ложную ошибку:
 *   первый запрос прошёл, повтор получил 404. Повторяет водитель — кнопкой
 *   «Повторить» в окне, уже после сверки.
 *
 * @dependencies: @/lib/utils (humanApiError), @/types/order (тип статуса)
 * @created: 2026-09-14 (1.5.65, MOB-081)
 */

import { humanApiError } from '@/lib/utils';
import type { OrderStatus } from '@/types/order';

/** Этапное действие водителя по заказу. */
export type StageAction = 'arrive' | 'start' | 'complete';

/** Сколько раз react-query сам повторяет действие водителя — ни разу. */
export const ACTION_MUTATION_RETRY = 0;

/** Причина отказа — то, от чего зависит, что водителю делать. */
export type ActionErrorKind =
  | 'network'
  | 'timeout'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'server'
  | 'rejected'
  | 'unknown';

export interface ActionError {
  kind: ActionErrorKind;
  /** Код ответа сервера; `null` — ответа не было вовсе. */
  status: number | null;
  /** Текст ошибки: у ответов сервера — уже человеческий (клиент API). */
  message: string | null;
}

function kindForStatus(status: number): ActionErrorKind {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  // 504 отдаёт прокси, когда приложение не успело: для водителя это то же
  // «сервер не ответил», что и таймаут на телефоне.
  if (status === 408 || status === 504) return 'timeout';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server';
  return 'rejected';
}

/**
 * Разобрать ошибку клиента API.
 *
 * По полям, а не по `instanceof`: классы ky и fetch тянут за собой среду
 * выполнения, а решение должно проверяться тестом без неё. ky называет свои
 * ошибки `HTTPError` и `TimeoutError`; сетевой сбой в React Native — это
 * `TypeError('Network request failed')`.
 */
export function classifyActionError(error: unknown): ActionError {
  if (!error || typeof error !== 'object') {
    return { kind: 'unknown', status: null, message: null };
  }
  const e = error as { name?: unknown; message?: unknown; response?: { status?: unknown } };
  const message = typeof e.message === 'string' && e.message.trim() ? e.message.trim() : null;

  if (e.name === 'TimeoutError') return { kind: 'timeout', status: null, message };

  const status = typeof e.response?.status === 'number' ? e.response.status : null;
  if (e.name === 'HTTPError' && status !== null) {
    return { kind: kindForStatus(status), status, message };
  }
  if (e.name === 'TypeError') return { kind: 'network', status: null, message };
  return { kind: 'unknown', status: null, message };
}

/** С какого этапа действие начинается и каким кончается. */
const STAGE: Record<StageAction, { from: OrderStatus; to: OrderStatus | null }> = {
  arrive: { from: 'assigned', to: 'driver_arrived' },
  start: { from: 'driver_arrived', to: 'in_progress' },
  // Завершённый заказ из активных уходит — «после» у него нет статуса.
  complete: { from: 'in_progress', to: null },
};

/** Порядок этапов активного заказа. */
const RANK: Partial<Record<OrderStatus, number>> = {
  assigned: 1,
  driver_arrived: 2,
  in_progress: 3,
};

/** Чем на самом деле кончилось действие, которое вернуло ошибку. */
export type ActionOutcome =
  /** Прошло: ответ потерялся или нажали дважды. Молча обновить экран. */
  | 'done'
  /** Заказа нет среди активных: сняли, отменили, передали — или завершён. */
  | 'gone'
  /** Заказ на месте, но этап другой: его сдвинул диспетчер. */
  | 'changed'
  /** Заказ на том же этапе — действие действительно не прошло. */
  | 'failed'
  /** Свежий список получить не удалось — прошло ли, неизвестно. */
  | 'unknown';

/**
 * Сверить отказ со свежим списком активных заказов.
 *
 * Заказ ищется по id, а не первым в списке: при встречном заказе их два, и
 * провал действия по одному ничего не говорит о другом.
 *
 * @param fresh активные заказы сразу после отказа; `null` — не получили
 */
export function reconcileActionFailure(input: {
  action: StageAction;
  orderId: string;
  fresh: readonly { id: string; status: OrderStatus }[] | null;
}): ActionOutcome {
  if (input.fresh === null) return 'unknown';
  const current = input.fresh.find((order) => order.id === input.orderId);
  if (!current) return 'gone';

  const { from, to } = STAGE[input.action];
  if (current.status === from) return 'failed';

  const rank = RANK[current.status];
  const fromRank = RANK[from];
  if (to !== null && rank !== undefined && fromRank !== undefined && rank > fromRank) {
    return 'done';
  }
  return 'changed';
}

/** Окно для водителя. */
export interface ActionMessage {
  title: string;
  message: string;
  /** Предложить «Повторить»: повтор может помочь и ничего не задвоит. */
  canRetry: boolean;
}

const STAGE_TITLE: Record<StageAction, string> = {
  arrive: 'Отметка «На месте» не прошла',
  start: 'Поездка не началась',
  complete: 'Поездка не завершена',
};

/**
 * Текст по причине — для действий, которые действительно не прошли.
 *
 * @param retry как позвать повторить: в окне этапа есть кнопка «Повторить»,
 *   в окне принятия её нет — там повтор это новое нажатие в списке
 * @param canRetry можно ли вообще предлагать повтор в этом окне
 */
function byKind(
  error: ActionError,
  title: string,
  fallback: string,
  retry: { phrase: string; canRetry: boolean },
): ActionMessage {
  switch (error.kind) {
    case 'network':
      return {
        title,
        message: `Нет связи с сервером. Проверьте интернет и ${retry.phrase}.`,
        canRetry: retry.canRetry,
      };
    case 'timeout':
      return {
        title,
        message: `Сервер не ответил. Проверьте связь и ${retry.phrase}.`,
        canRetry: retry.canRetry,
      };
    case 'server':
      return {
        title,
        message:
          'Сервер не справился. Попробуйте ещё раз через минуту; если не проходит — позвоните диспетчеру.',
        canRetry: retry.canRetry,
      };
    case 'rate_limited':
      return {
        title,
        message: `Слишком часто. Подождите немного и ${retry.phrase}.`,
        canRetry: retry.canRetry,
      };
    case 'forbidden':
      return { title, message: 'Доступ закрыт. Войдите в приложение заново.', canRetry: false };
    case 'conflict':
      // У 409 сервер всегда объясняет, что делать (встречный заказ), — его
      // текст точнее любого нашего.
      return { title, message: humanApiError(error.message ?? '', fallback), canRetry: false };
    default:
      return {
        title,
        message: humanApiError(error.message ?? '', fallback),
        canRetry: retry.canRetry,
      };
  }
}

/** В окне этапа повтор — кнопкой. */
const STAGE_RETRY = { phrase: 'нажмите «Повторить»', canRetry: true };
/** В окне принятия кнопки нет: заказ к повтору мог уйти, список скажет честнее. */
const ACCEPT_RETRY = { phrase: 'попробуйте ещё раз', canRetry: false };

/**
 * Что сказать водителю после отказа этапного действия.
 *
 * `null` — говорить нечего: действие на самом деле прошло, или сессия
 * истекла и клиент API уже ведёт на экран входа.
 */
export function describeActionFailure(
  action: StageAction,
  outcome: ActionOutcome,
  error: ActionError,
): ActionMessage | null {
  if (outcome === 'done' || error.kind === 'unauthorized') return null;

  if (outcome === 'gone') {
    return action === 'complete'
      ? {
          title: 'Заказ уже закрыт',
          message:
            'Среди ваших заказов его больше нет: он завершён или снят диспетчером. Итог — в «Истории».',
          canRetry: false,
        }
      : {
          title: 'Заказа больше нет у вас',
          message: 'Его отменили или передали другому водителю. Подробности — у диспетчера.',
          canRetry: false,
        };
  }

  const title = STAGE_TITLE[action];
  if (outcome === 'changed') {
    return {
      title,
      message: 'Статус заказа изменился. Экран обновлён — проверьте этап.',
      canRetry: false,
    };
  }

  return byKind(
    error,
    title,
    'Действие не прошло. Попробуйте ещё раз или позвоните диспетчеру.',
    STAGE_RETRY,
  );
}

/**
 * Что сказать, когда не принялся заказ.
 *
 * Сверки здесь нет: принятие гонится с другими водителями, и «заказ уже
 * недоступен» — обычный исход, о котором сервер говорит сам.
 */
export function describeAcceptFailure(error: ActionError): ActionMessage | null {
  if (error.kind === 'unauthorized') return null;
  const title = 'Заказ не принят';
  if (error.kind === 'timeout') {
    return {
      title,
      message:
        'Сервер не ответил. Проверьте вкладку «Заказ»: возможно, заказ уже у вас или его взял другой водитель.',
      canRetry: false,
    };
  }
  return byKind(
    error,
    title,
    'Заказ уже недоступен: возможно, его взял другой водитель.',
    ACCEPT_RETRY,
  );
}
