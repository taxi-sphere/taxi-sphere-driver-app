/**
 * @file: src/lib/order-offer.test.ts
 * @description:
 *   Таймер и выбор предложения заказа (1.5.59).
 *
 *   Ошибка в таймере здесь стоит заказа в обе стороны: покажем меньше, чем
 *   даёт сервер, — водитель торопится или не успевает; покажем больше —
 *   нажмёт «Принять», когда предложение уже ушло другому.
 *
 * @dependencies: vitest, @/lib/order-offer
 * @created: 2026-09-13 (1.5.59)
 */

import { describe, it, expect } from 'vitest';
import {
  OFFER_MIN_VISIBLE_SEC,
  nextActiveOffer,
  offerDeadlineMs,
  offerRemainingSec,
  type ActiveOffer,
} from '@/lib/order-offer';
import type { OrderOfferEvent } from '@/types/socket-events';

const SERVER_NOW = '2026-09-13T12:00:00.000Z';
const PHONE_NOW = Date.parse('2026-09-13T12:03:17.000Z'); // часы телефона убежали на 3 мин

const offer = (patch: Partial<OrderOfferEvent> = {}): OrderOfferEvent => ({
  orderId: 'order-1',
  serverTime: SERVER_NOW,
  expiresAt: '2026-09-13T12:00:30.000Z',
  ttlSec: 30,
  source: 'auto',
  pickupAddress: 'ул. Мира, 4',
  ...patch,
});

describe('offerDeadlineMs', () => {
  it('отсчитывает срок от получения, а не по часам сервера', () => {
    expect(offerDeadlineMs(offer(), PHONE_NOW)).toBe(PHONE_NOW + 30_000);
  });

  it('сервер отправил через 4 секунды после создания — остаток 26 с, а не 30', () => {
    // Остаток считается от серверных часов в момент отправки, а не от ttlSec:
    // иначе повторно отправленное предложение показало бы полный срок.
    const late = offer({ serverTime: '2026-09-13T12:00:04.000Z' });
    expect(offerDeadlineMs(late, PHONE_NOW)).toBe(PHONE_NOW + 26_000);
  });

  it('не обещает дольше полного срока, даже если часы в событии испорчены', () => {
    const broken = offer({ serverTime: '2026-09-13T11:50:00.000Z' });
    expect(offerDeadlineMs(broken, PHONE_NOW)).toBe(PHONE_NOW + 30_000);
  });

  it('без разборчивых дат берёт полный срок', () => {
    const garbage = offer({ serverTime: 'вчера', expiresAt: '' });
    expect(offerDeadlineMs(garbage, PHONE_NOW)).toBe(PHONE_NOW + 30_000);
  });

  it('просроченное к моменту отправки — нулевой остаток, а не отрицательный', () => {
    const expired = offer({ expiresAt: '2026-09-13T11:59:50.000Z' });
    expect(offerDeadlineMs(expired, PHONE_NOW)).toBe(PHONE_NOW);
  });
});

describe('offerRemainingSec', () => {
  it('округляет вверх: 0.2 с — это ещё секунда', () => {
    expect(offerRemainingSec(10_200, 10_000)).toBe(1);
  });

  it('после срока — ноль', () => {
    expect(offerRemainingSec(10_000, 12_000)).toBe(0);
  });
});

describe('nextActiveOffer', () => {
  const held = (orderId: string, leftMs: number): ActiveOffer => ({
    event: offer({ orderId }),
    deadlineMs: PHONE_NOW + leftMs,
  });

  it('первое предложение — показываем', () => {
    const next = nextActiveOffer(null, offer(), PHONE_NOW);
    expect(next?.event.orderId).toBe('order-1');
  });

  it(`опоздавшее (меньше ${OFFER_MIN_VISIBLE_SEC} с) — не показываем`, () => {
    const late = offer({ serverTime: '2026-09-13T12:00:28.000Z' });
    expect(nextActiveOffer(null, late, PHONE_NOW)).toBeNull();
  });

  it('второй заказ не перебивает окно, пока водитель решает по первому', () => {
    const current = held('order-1', 20_000);
    const next = nextActiveOffer(current, offer({ orderId: 'order-2' }), PHONE_NOW);
    expect(next).toBe(current);
  });

  it('повтор того же заказа обновляет срок', () => {
    const current = held('order-1', 5_000);
    const next = nextActiveOffer(current, offer(), PHONE_NOW);
    expect(next?.deadlineMs).toBe(PHONE_NOW + 30_000);
  });

  it('прежнее истекло — новое показываем', () => {
    const current = held('order-1', -1_000);
    const next = nextActiveOffer(current, offer({ orderId: 'order-2' }), PHONE_NOW);
    expect(next?.event.orderId).toBe('order-2');
  });
});
