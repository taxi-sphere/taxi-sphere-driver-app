/**
 * @file: src/lib/trip-receipt.test.ts
 * @description:
 *   Тесты чека поездки.
 *
 *   ГЛАВНОЕ СВОЙСТВО, которое они держат: показанные строки в сумме дают
 *   показанный итог. Оно не выводится из типов и не падает при нарушении —
 *   чек просто не сходится на глазах у клиента.
 *
 * @dependencies: vitest, @/lib/trip-receipt
 * @created: 2026-09-09 (1.5.48)
 */

import { describe, it, expect } from 'vitest';
import { rideCostOf } from '@/lib/trip-receipt';

/** Как строка попадёт на экран: `formatCurrency` округляет к рублю. */
const shown = (v: number) => Math.round(v);

describe('rideCostOf — чек сходится', () => {
  it('дробные суммы: строки в сумме дают итог, а не итог плюс рубль', () => {
    // Ровно случай с эмулятора 1.5.48: 24.6 + 28.6 = 53.2. Наивное
    // вычитание дало бы «25 + 29 = 54» при итоге 53.
    const total = 53.2;
    const waiting = 28.6;
    expect(rideCostOf(total, waiting) + shown(waiting)).toBe(shown(total));
    expect(rideCostOf(total, waiting)).toBe(24);
  });

  it('обе половины округляются вверх — итог всё равно бьётся', () => {
    const total = 100.6;
    const waiting = 50.6;
    expect(rideCostOf(total, waiting) + shown(waiting)).toBe(shown(total));
  });

  it('целые числа — без сюрпризов', () => {
    expect(rideCostOf(120, 20)).toBe(100);
  });

  it('ожидания не было — вся сумма за поездку', () => {
    expect(rideCostOf(240, 0)).toBe(240);
  });
});

describe('rideCostOf — вырожденные случаи', () => {
  it('ожидание дороже итога (сработала минималка) — не уходим в минус', () => {
    // Отрицательную строку водителю нечем объяснить клиенту.
    expect(rideCostOf(50, 60)).toBe(0);
  });

  it('итог равен стоимости ожидания — за поездку ноль, и это правда', () => {
    expect(rideCostOf(60, 60)).toBe(0);
  });

  it('NaN из разбора ответа не течёт в чек', () => {
    expect(rideCostOf(Number.NaN, 20)).toBe(0);
    expect(rideCostOf(100, Number.NaN)).toBe(100);
  });
});
