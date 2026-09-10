/**
 * @file: src/lib/route-panel.test.ts
 * @description:
 *   Правила нажатий в панели выбора пути.
 *
 *   ЗАЧЕМ. Одно и то же нажатие значит разное в зависимости от состояния, а
 *   ошибка здесь стоит водителю потерянного маршрута на ходу: ряд свернулся
 *   вместо выбора или наоборот. Проверять это на эмуляторе — минуты на
 *   каждый случай, здесь — миллисекунды.
 *
 * @dependencies: vitest, @/lib/route-panel
 * @created: 2026-09-10 (1.5.57)
 */

import { describe, it, expect } from 'vitest';
import {
  isRoutePanelTargetActive,
  routePanelAction,
  type RoutePanelState,
} from './route-panel';

const FASTEST = { kind: 'variant', index: 0 } as const;
const OTHER = { kind: 'variant', index: 1 } as const;
const NO_ROUTE = { kind: 'noRoute' } as const;

function state(over: Partial<RoutePanelState> = {}): RoutePanelState {
  return { chosenIndex: 0, hidden: false, ...over };
}

describe('isRoutePanelTargetActive', () => {
  it('по умолчанию активен быстрый вариант', () => {
    expect(isRoutePanelTargetActive(FASTEST, state())).toBe(true);
    expect(isRoutePanelTargetActive(OTHER, state())).toBe(false);
    expect(isRoutePanelTargetActive(NO_ROUTE, state())).toBe(false);
  });

  it('после выбора активен выбранный', () => {
    const s = state({ chosenIndex: 1 });
    expect(isRoutePanelTargetActive(OTHER, s)).toBe(true);
    expect(isRoutePanelTargetActive(FASTEST, s)).toBe(false);
  });

  it('скрытая линия перебивает выбранный вариант', () => {
    // Выбор сохранён, но на карте его не видно — подсветить вариант значило
    // бы соврать про то, что водитель сейчас видит.
    const s = state({ chosenIndex: 1, hidden: true });
    expect(isRoutePanelTargetActive(NO_ROUTE, s)).toBe(true);
    expect(isRoutePanelTargetActive(OTHER, s)).toBe(false);
    expect(isRoutePanelTargetActive(FASTEST, s)).toBe(false);
  });
});

describe('routePanelAction', () => {
  it('нажатие на чужой вариант — выбрать его', () => {
    expect(routePanelAction(OTHER, state())).toBe('choose');
  });

  it('нажатие на выбранный — свернуть ряд', () => {
    expect(routePanelAction(FASTEST, state())).toBe('collapse');
    expect(routePanelAction(OTHER, state({ chosenIndex: 1 }))).toBe('collapse');
  });

  it('можно вернуться к быстрому, ткнув в него из другого варианта', () => {
    expect(routePanelAction(FASTEST, state({ chosenIndex: 1 }))).toBe('choose');
  });

  it('«Без маршрута» убирает линию, повторное нажатие сворачивает', () => {
    expect(routePanelAction(NO_ROUTE, state())).toBe('hide');
    expect(routePanelAction(NO_ROUTE, state({ hidden: true }))).toBe('collapse');
  });

  it('при скрытой линии нажатие на вариант возвращает её, а не сворачивает', () => {
    // Иначе водитель, спрятавший маршрут, не смог бы вернуть его одним
    // нажатием: ряд схлопнулся бы, а линии так и не появилось.
    const s = state({ hidden: true });
    expect(routePanelAction(FASTEST, s)).toBe('choose');
    expect(routePanelAction(OTHER, s)).toBe('choose');
  });

  it('скрытая линия при уже выбранном варианте: тот же вариант возвращает её', () => {
    const s = state({ chosenIndex: 1, hidden: true });
    expect(routePanelAction(OTHER, s)).toBe('choose');
  });
});
