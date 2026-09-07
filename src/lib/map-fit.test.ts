/**
 * @file: src/lib/map-fit.test.ts
 * @description:
 *   Тесты правила «когда карта заказа подгоняет охват сама».
 *
 *   ЗАЧЕМ ИМЕННО ЭТИ. Ошибка здесь тихая и обнаруживается только за рулём:
 *   карта прыгает к общему плану каждые несколько секунд, и водитель не
 *   может её отмасштабировать. Поэтому проверяется главное — движение
 *   водителя ключ НЕ меняет, а смена стадии и приход маршрута меняют.
 *
 * @dependencies: vitest, @/lib/map-fit
 * @created: 2026-09-04 (1.5.37)
 */

import { describe, it, expect } from 'vitest';
import { mapFitKey, type MapFitInputs } from './map-fit';

const base: MapFitInputs = {
  orderId: 'order-1',
  status: 'assigned',
  hasPickup: true,
  hasDropoff: true,
  stopsCount: 0,
  hasRoute: false,
  hasDriverLocation: false,
};

describe('mapFitKey', () => {
  it('движение водителя охват не трогает', () => {
    // Координат в аргументах нет вовсе — и это главное свойство: пока
    // водитель просто едет, ключ не меняется, и карта остаётся такой,
    // какой он её оставил.
    const withDriver = { ...base, hasDriverLocation: true };
    expect(mapFitKey(withDriver)).toBe(mapFitKey({ ...withDriver }));
  });

  it('первая позиция водителя охват пересчитывает', () => {
    // До неё водителя на карте нет, и общий план построен без него.
    expect(mapFitKey({ ...base, hasDriverLocation: true })).not.toBe(mapFitKey(base));
  });

  it('смена стадии пересчитывает: цель переехала на точку назначения', () => {
    expect(mapFitKey({ ...base, status: 'in_progress' })).not.toBe(mapFitKey(base));
  });

  it('пришедшая линия маршрута пересчитывает', () => {
    expect(mapFitKey({ ...base, hasRoute: true })).not.toBe(mapFitKey(base));
  });

  it('другой заказ пересчитывает', () => {
    expect(mapFitKey({ ...base, orderId: 'order-2' })).not.toBe(mapFitKey(base));
  });

  it('появившиеся координаты и новая промежуточная точка пересчитывают', () => {
    const noCoords = { ...base, hasPickup: false, hasDropoff: false };
    expect(mapFitKey(noCoords)).not.toBe(mapFitKey(base));
    expect(mapFitKey({ ...base, stopsCount: 1 })).not.toBe(mapFitKey(base));
  });
});
