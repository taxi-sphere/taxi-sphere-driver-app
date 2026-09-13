/**
 * @file: src/lib/order-offer.ts
 * @description:
 *   Предложение заказа от сервера: сколько у водителя времени и какое из
 *   пришедших предложений показывать (1.5.59).
 *
 *   ЗАЧЕМ. Сервер умел предлагать заказ конкретному водителю с марта, а
 *   приложение этого не понимало: личное предложение приходило тем же
 *   `order:new`, что и любой заказ в списке, — звук, обновлённый список, и
 *   всё. Через 15 секунд предложение истекало, водитель так и не узнавал, что
 *   заказ был его, и заказ уходил в «Без водителя». С сервера v1.100.13
 *   предложение приходит отдельным `order:offer` со сроком, и приложение
 *   показывает окно «Входящий заказ» — то же, что при взятии из свободных.
 *
 *   ЧАСЫ ТЕЛЕФОНА НЕ СОВПАДАЮТ С СЕРВЕРНЫМИ. У водителей они расходятся на
 *   минуты, и остаток, посчитанный как `expiresAt − Date.now()`, мог бы
 *   оказаться и нулевым, и пятиминутным. Сервер присылает свои часы в момент
 *   отправки (`serverTime`); берём разность `expiresAt − serverTime` и
 *   отсчитываем её от момента получения по часам телефона.
 *
 *   Чистые функции — проверяются без сокета и без React.
 *
 * @dependencies: @/types/socket-events
 * @created: 2026-09-13 (1.5.59)
 */

import type { OrderOfferEvent } from '@/types/socket-events';

/**
 * Меньше стольких секунд окно не открываем.
 *
 * Предложение, до которого осталась секунда-другая (пришло с задержкой
 * после обрыва связи), водитель не успеет даже прочитать — окно мигнуло бы
 * и закрылось, а звук и вибрация сработали бы впустую.
 */
export const OFFER_MIN_VISIBLE_SEC = 3;

/** Предложение, которое приложение сейчас держит. */
export interface ActiveOffer {
  event: OrderOfferEvent;
  /** Когда сервер снимет предложение — по часам ТЕЛЕФОНА, мс. */
  deadlineMs: number;
}

/**
 * Момент окончания предложения по часам телефона.
 *
 * Остаток не больше полного срока: если часы сервера в событии испорчены,
 * таймер длиннее, чем сервер вообще даёт, был бы обещанием, которого сервер
 * не выполнит.
 */
export function offerDeadlineMs(event: OrderOfferEvent, receivedAtMs: number): number {
  const fullMs = Math.max(0, event.ttlSec) * 1000;
  const expires = Date.parse(event.expiresAt);
  const server = Date.parse(event.serverTime);
  const leftMs =
    Number.isFinite(expires) && Number.isFinite(server) ? expires - server : fullMs;
  return receivedAtMs + Math.max(0, Math.min(leftMs, fullMs));
}

/** Сколько целых секунд осталось. Округление вверх: «0 с» — значит, всё. */
export function offerRemainingSec(deadlineMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}

/**
 * Какое предложение держать после того, как пришло новое.
 *
 * - Опоздавшее (осталось меньше `OFFER_MIN_VISIBLE_SEC`) — не показываем.
 * - Повтор того же заказа — обновляет срок: сервер мог продлить.
 * - Пока водитель решает по одному заказу, второй не перебивает окно: он
 *   взял бы только один, а подменённый под пальцем адрес — прямой путь
 *   принять не тот заказ. Сервер снимет второе предложение сам и отдаст
 *   заказ следующему.
 */
export function nextActiveOffer(
  current: ActiveOffer | null,
  event: OrderOfferEvent,
  nowMs: number,
): ActiveOffer | null {
  const incoming: ActiveOffer = { event, deadlineMs: offerDeadlineMs(event, nowMs) };
  if (offerRemainingSec(incoming.deadlineMs, nowMs) < OFFER_MIN_VISIBLE_SEC) return current;
  if (!current) return incoming;
  if (current.event.orderId === event.orderId) return incoming;
  if (offerRemainingSec(current.deadlineMs, nowMs) === 0) return incoming;
  return current;
}
