/**
 * @file: src/lib/preorder-timing.test.ts
 * @description:
 *   Когда предзаказ в списке свободных считается текущим (1.5.60). Граница
 *   обязана совпадать с серверной (`process-scheduled`): иначе заказ, который
 *   сервер уже предлагает, висел бы у водителя в «Предзаказах».
 *
 * @dependencies: vitest, @/lib/preorder-timing
 * @created: 2026-09-13 (1.5.60)
 */

import { describe, it, expect } from 'vitest';
import { isOrderCurrent } from '@/lib/preorder-timing';

const NOW = Date.parse('2026-09-13T13:30:00.000Z');
const MIN = 60_000;
const at = (offsetMin: number) => new Date(NOW + offsetMin * MIN).toISOString();

describe('isOrderCurrent', () => {
  it('заказ без времени подачи — текущий', () => {
    expect(isOrderCurrent(null, 35, NOW)).toBe(true);
  });

  it('до подачи больше lead time — предзаказ', () => {
    expect(isOrderCurrent(at(36), 35, NOW)).toBe(false);
  });

  it('ровно lead time до подачи — уже текущий', () => {
    expect(isOrderCurrent(at(35), 35, NOW)).toBe(true);
  });

  it('время подачи прошло — текущий', () => {
    expect(isOrderCurrent(at(-5), 35, NOW)).toBe(true);
  });

  it('старый сервер без цифры: текущий только когда время наступило', () => {
    expect(isOrderCurrent(at(10), undefined, NOW)).toBe(false);
    expect(isOrderCurrent(at(0), undefined, NOW)).toBe(true);
    expect(isOrderCurrent(at(-1), null, NOW)).toBe(true);
  });

  it('неразборчивое время — остаётся предзаказом', () => {
    expect(isOrderCurrent('не дата', 35, NOW)).toBe(false);
  });

  it('отрицательный lead time считается нулём', () => {
    expect(isOrderCurrent(at(10), -5, NOW)).toBe(false);
  });
});
