/**
 * @file: src/lib/design/tokens.test.ts
 * @description:
 *   Кнопки камеры на карте заказа: зоны нажатия соседних кнопок не
 *   перекрываются и не меньше пальца.
 *
 *   ЗАЧЕМ. Кнопки «весь маршрут» и «к машине» стоят одна под другой и делают
 *   противоположное. До 1.5.65 зазор между ними был 8 dp при запасе нажатия
 *   8 dp с каждой стороны: зазор целиком покрывали обе зоны, и нажатие чуть
 *   выше «к машине» отдаляло камеру на весь маршрут. Глазами на эмуляторе
 *   этого не видно — только расчётом, поэтому он здесь.
 *
 * @dependencies: vitest, ./tokens
 * @created: 2026-09-14 (1.5.65)
 */

import { describe, it, expect } from 'vitest';
import { mapButton, touch } from './tokens';

describe('mapButton — кнопки камеры на карте заказа', () => {
  it('зоны нажатия соседних кнопок не перекрываются', () => {
    expect(mapButton.gap).toBeGreaterThanOrEqual(2 * mapButton.hitSlop);
  });

  it('зона нажатия не меньше пальца', () => {
    expect(mapButton.size + 2 * mapButton.hitSlop).toBeGreaterThanOrEqual(touch.min);
  });
});
