/**
 * @file: src/lib/route-choice.test.ts
 * @description:
 *   Тесты выбора варианта пути и его удержания.
 *
 *   ЗАЧЕМ ИМЕННО ОНИ. Ошибка здесь не падает и не видна в логе: водителя
 *   просто ведёт не туда, куда он ткнул. Проверяется главное свойство —
 *   опорная точка обязана попадать НА РАСХОЖДЕНИЕ путей, а не на общий
 *   участок, иначе роутер построит тот же быстрый маршрут и выбор пропадёт.
 *
 * @dependencies: vitest, @/lib/route-choice
 * @created: 2026-09-09 (1.5.49)
 */

import { describe, it, expect } from 'vitest';
import {
  distanceM,
  pickAnchor,
  isAnchorPassed,
  hasRealChoice,
  ANCHOR_REACHED_M,
  MIN_DIVERGENCE_M,
} from '@/lib/route-choice';

const p = (latitude: number, longitude: number) => ({ latitude, longitude });

/** ~1 км по широте — удобный масштаб для проверок. */
const KM = 0.009;

describe('distanceM', () => {
  it('одна точка — ноль', () => {
    expect(distanceM(p(55.75, 37.62), p(55.75, 37.62))).toBe(0);
  });

  it('километр по широте', () => {
    const d = distanceM(p(55.75, 37.62), p(55.75 + KM, 37.62));
    expect(d).toBeGreaterThan(950);
    expect(d).toBeLessThan(1050);
  });
});

describe('pickAnchor — где пути расходятся', () => {
  it('берёт точку максимального отхода, а не середину', () => {
    // Быстрый — прямая с запада на восток. Выбранный уходит на север
    // посередине и возвращается. Середина ВЫБРАННОГО пути по индексу — это
    // как раз вершина крюка, но проверяем именно геометрию.
    const reference = [p(55.75, 37.60), p(55.75, 37.62), p(55.75, 37.64)];
    const selected = [
      p(55.75, 37.60),
      p(55.75 + KM, 37.62), // крюк на километр к северу
      p(55.75, 37.64),
    ];
    const anchor = pickAnchor(selected, reference);
    expect(anchor).not.toBeNull();
    expect(anchor!.latitude).toBeCloseTo(55.75 + KM, 5);
  });

  it('общий участок не может стать опорной точкой', () => {
    // Начало и конец у путей общие: если бы брали середину массива или
    // первую точку, попали бы на общий участок — и роутер построил бы тот
    // же быстрый маршрут, а выбор бы пропал.
    const reference = [p(55.75, 37.60), p(55.75, 37.64)];
    const selected = [p(55.75, 37.60), p(55.75 + KM, 37.62), p(55.75, 37.64)];
    const anchor = pickAnchor(selected, reference);
    expect(anchor).not.toBeNull();
    expect(distanceM(anchor!, p(55.75, 37.60))).toBeGreaterThan(MIN_DIVERGENCE_M);
    expect(distanceM(anchor!, p(55.75, 37.64))).toBeGreaterThan(MIN_DIVERGENCE_M);
  });

  it('пути почти совпадают — выбирать нечего', () => {
    // Объезд одного двора не повод отвлекать водителя выбором на ходу.
    const reference = [p(55.75, 37.60), p(55.75, 37.64)];
    const selected = [p(55.75, 37.60), p(55.7505, 37.62), p(55.75, 37.64)];
    expect(pickAnchor(selected, reference)).toBeNull();
  });

  it('редкая геометрия эталона не делает совпадающие пути разными', () => {
    // Дефект, пойманный тестом при разработке: расстояние считалось до
    // ВЕРШИН ломаной. Эталон из двух точек в двух километрах друг от друга —
    // и точка ровно посередине, лежащая НА той же прямой, оказывалась в
    // 1250 метрах «расхождения». Совпадающие пути объявлялись разными, и
    // водителю предлагали выбор из одного и того же.
    const sparse = [p(55.75, 37.60), p(55.75, 37.64)];
    const sameLine = [p(55.75, 37.60), p(55.75, 37.62), p(55.75, 37.64)];
    expect(pickAnchor(sameLine, sparse)).toBeNull();
  });

  it('пустые пути — null, а не падение', () => {
    expect(pickAnchor([], [p(55.75, 37.6)])).toBeNull();
    expect(pickAnchor([p(55.75, 37.6)], [])).toBeNull();
  });
});

describe('isAnchorPassed — когда забыть выбор', () => {
  const anchor = p(55.76, 37.62);
  const target = p(55.75, 37.70);

  it('нет точки или нет позиции — не пройдена', () => {
    expect(isAnchorPassed(null, p(55.76, 37.62), target)).toBe(false);
    expect(isAnchorPassed(anchor, null, target)).toBe(false);
  });

  it('водитель вплотную — пройдена', () => {
    expect(isAnchorPassed(anchor, p(55.7601, 37.6201), target)).toBe(true);
  });

  it('водитель далеко и до цели ещё дальше, чем точке — не пройдена', () => {
    // Едем к развилке: точку снимать рано, иначе выбор потеряется.
    expect(isAnchorPassed(anchor, p(55.76, 37.50), target)).toBe(false);
  });

  it('объехал стороной, но уже ближе к цели — пройдена', () => {
    // Главный случай, ради которого второе условие и нужно: на развязке
    // водитель может не попасть в радиус вокруг точки, и без этой проверки
    // маршрут потянул бы его НАЗАД, к уже ненужной точке.
    const passed = p(55.75, 37.68);
    expect(distanceM(passed, anchor)).toBeGreaterThan(ANCHOR_REACHED_M);
    expect(isAnchorPassed(anchor, passed, target)).toBe(true);
  });

  it('без цели работает только радиус', () => {
    expect(isAnchorPassed(anchor, p(55.75, 37.68), null)).toBe(false);
    expect(isAnchorPassed(anchor, p(55.7601, 37.6201), null)).toBe(true);
  });
});

describe('hasRealChoice', () => {
  const straight = [p(55.75, 37.60), p(55.75, 37.64)];
  const detour = [p(55.75, 37.60), p(55.75 + KM, 37.62), p(55.75, 37.64)];

  it('один вариант — выбора нет', () => {
    expect(hasRealChoice([{ coordinates: straight }])).toBe(false);
  });

  it('два ощутимо разных — выбор есть', () => {
    expect(hasRealChoice([{ coordinates: straight }, { coordinates: detour }])).toBe(true);
  });

  it('два почти одинаковых — выбора нет', () => {
    const almost = [p(55.75, 37.60), p(55.7503, 37.62), p(55.75, 37.64)];
    expect(hasRealChoice([{ coordinates: straight }, { coordinates: almost }])).toBe(false);
  });

  it('пустой список не роняет', () => {
    expect(hasRealChoice([])).toBe(false);
  });
});
