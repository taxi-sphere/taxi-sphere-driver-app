/**
 * @file: src/lib/heading.test.ts
 * @description:
 *   Тесты направления стрелки водителя на карте.
 *
 *   ЗАЧЕМ ИМЕННО ЭТИ. Проверяется то, ради чего модуль и появился: угол
 *   берётся по РЕАЛЬНОЙ базе, а не по соседней точке (иначе стрелка дрожит
 *   на месте), неизвестное направление возвращается как `null`, а не как
 *   «на север».
 *
 * @dependencies: vitest, @/lib/heading
 * @created: 2026-09-07 (1.5.38)
 */

import { describe, it, expect } from 'vitest';
import { bearingDegrees, distanceMeters, headingAlong, MIN_SPAN_M } from './heading';

/** Тула, центр — на этой широте градус долготы ≈ 62 км. */
const BASE = { latitude: 54.193, longitude: 37.617 };

/** Сдвиг на север, в метрах. */
function north(meters: number) {
  return { latitude: BASE.latitude + meters / 111_320, longitude: BASE.longitude };
}

/** Сдвиг на восток, в метрах. */
function east(meters: number) {
  const perDegree = 111_320 * Math.cos((BASE.latitude * Math.PI) / 180);
  return { latitude: BASE.latitude, longitude: BASE.longitude + meters / perDegree };
}

describe('distanceMeters', () => {
  it('считает расстояние с точностью до процента', () => {
    expect(distanceMeters(BASE, north(100))).toBeCloseTo(100, 0);
    expect(distanceMeters(BASE, east(250))).toBeCloseTo(250, 0);
  });

  it('расстояние до самой себя — ноль', () => {
    expect(distanceMeters(BASE, BASE)).toBe(0);
  });
});

describe('bearingDegrees', () => {
  it('север — 0°, восток — 90°', () => {
    expect(bearingDegrees(BASE, north(100))).toBeCloseTo(0, 1);
    expect(bearingDegrees(BASE, east(100))).toBeCloseTo(90, 1);
  });

  it('юг — 180°, запад — 270°, а не минус 90°', () => {
    expect(bearingDegrees(BASE, north(-100))).toBeCloseTo(180, 1);
    // Шкала [0, 360): отрицательный угол `rotation` отыграл бы в другую
    // сторону, поэтому запад обязан быть именно 270.
    expect(bearingDegrees(BASE, east(-100))).toBeCloseTo(270, 1);
  });
});

describe('headingAlong', () => {
  it('пропускает точки ближе порога и берёт первую дальнюю', () => {
    // Первые две точки — шум в полуметре, и угол по ним был бы случайным.
    // Настоящее направление задаёт только третья.
    const heading = headingAlong([BASE, east(0.4), east(0.6), north(40)]);
    expect(heading).toBeCloseTo(0, 0);
  });

  it('null, когда вся ломаная короче порога', () => {
    const heading = headingAlong([BASE, north(MIN_SPAN_M - 2)]);
    // Именно null: 0 означал бы «на север» — уверенно неверный ответ.
    expect(heading).toBeNull();
  });

  it('null на пустом и односоставном списке', () => {
    expect(headingAlong([])).toBeNull();
    expect(headingAlong([BASE])).toBeNull();
  });
});
