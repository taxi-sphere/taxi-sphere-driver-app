/**
 * @file: src/lib/map-orientation.test.ts
 * @description:
 *   Тесты правил поворота камеры карты.
 *
 *   ЗАЧЕМ ИМЕННО ЭТИ. Проверяется переход через север — единственное место,
 *   где наивная арифметика углов ломается молча: без короткой дуги карта
 *   разворачивалась бы через полный круг, а порог доворота срабатывал бы на
 *   ровном месте. Плюс порог как таковой: без него карта трясётся на каждом
 *   фиксе GPS, а слишком большой — и поворот запаздывает.
 *
 * @dependencies: vitest, @/lib/map-orientation
 * @created: 2026-09-08 (1.5.42)
 */

import { describe, it, expect } from 'vitest';
import {
  angleDelta,
  normalizeAngle,
  screenHeading,
  shouldTurnCamera,
  targetCameraHeading,
  TURN_THRESHOLD_DEG,
} from './map-orientation';

describe('normalizeAngle', () => {
  it('приводит к [0, 360)', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(-90)).toBe(270);
    expect(normalizeAngle(450)).toBe(90);
  });

  it('мусор не роняет расчёт', () => {
    expect(normalizeAngle(Number.NaN)).toBe(0);
    expect(normalizeAngle(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('angleDelta', () => {
  it('через север считает по короткой дуге, а не через полный круг', () => {
    expect(angleDelta(350, 10)).toBe(20);
    expect(angleDelta(10, 350)).toBe(-20);
  });

  it('обычный поворот', () => {
    expect(angleDelta(0, 90)).toBe(90);
    expect(angleDelta(90, 0)).toBe(-90);
  });

  it('разворот назад — ровно 180, а не -180', () => {
    expect(angleDelta(0, 180)).toBe(180);
  });
});

describe('shouldTurnCamera', () => {
  it('дрожание курса на прямой камеру не двигает', () => {
    expect(shouldTurnCamera(100, 103)).toBe(false);
  });

  it('поворот руля — двигает', () => {
    expect(shouldTurnCamera(100, 100 + TURN_THRESHOLD_DEG)).toBe(true);
    expect(shouldTurnCamera(100, 160)).toBe(true);
  });

  it('через север порог считается по короткой дуге', () => {
    expect(shouldTurnCamera(358, 2)).toBe(false); // 4° — шум
    expect(shouldTurnCamera(358, 20)).toBe(true); // 22° — поворот
  });

  it('курса нет — поворачивать не по чему', () => {
    expect(shouldTurnCamera(0, null)).toBe(false);
    expect(shouldTurnCamera(0, Number.NaN)).toBe(false);
  });
});

describe('screenHeading', () => {
  it('в режиме «по курсу» стрелка смотрит строго вверх', () => {
    // Камера довёрнута под курс — значит на экране разницы нет.
    expect(screenHeading(137, 137)).toBe(0);
    expect(screenHeading(0, 0)).toBe(0);
  });

  it('в режиме «север сверху» стрелка смотрит по курсу, как было раньше', () => {
    expect(screenHeading(137, 0)).toBe(137);
    expect(screenHeading(315, 0)).toBe(315);
  });

  it('камера довёрнута не до конца — стрелка показывает остаток', () => {
    expect(screenHeading(100, 90)).toBe(10);
  });

  it('через север угол остаётся положительным', () => {
    expect(screenHeading(10, 350)).toBe(20);
    expect(screenHeading(350, 10)).toBe(340);
  });
});

describe('targetCameraHeading', () => {
  it('север сверху — всегда ноль, какой бы ни был курс', () => {
    expect(targetCameraHeading('north', 137)).toBe(0);
    expect(targetCameraHeading('north', null)).toBe(0);
  });

  it('по курсу — курс водителя', () => {
    expect(targetCameraHeading('course', 137)).toBe(137);
  });

  it('по курсу без известного курса — север: разворачивать наугад нельзя', () => {
    expect(targetCameraHeading('course', null)).toBe(0);
    expect(targetCameraHeading('course', Number.NaN)).toBe(0);
  });
});
