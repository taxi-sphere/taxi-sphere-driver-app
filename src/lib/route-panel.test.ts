/**
 * @file: src/lib/route-panel.test.ts
 * @description:
 *   Правила нажатий в панели выбора пути.
 *
 *   ЗАЧЕМ. Одно и то же нажатие значит разное в зависимости от того, что
 *   водитель уже нажимал, а ошибка здесь стоит ему потерянного меню на ходу:
 *   ряд свернулся вместо переключения. Именно это и случилось в 1.5.57 —
 *   поэтому граница «нажатие водителя против самопроизвольной подсветки»
 *   проверяется здесь отдельными тестами.
 *
 * @dependencies: vitest, @/lib/route-panel
 * @created: 2026-09-10 (1.5.57)
 * @updated: 2026-09-11 (1.5.58 — решение по нажатиям водителя)
 */

import { describe, it, expect } from 'vitest';
import {
  isRoutePanelTargetActive,
  routePanelAction,
  routePanelKey,
  ROUTE_PANEL_AUTOHIDE_MS,
  type RoutePanelState,
} from './route-panel';

const FASTEST = { kind: 'variant', index: 0 } as const;
const OTHER = { kind: 'variant', index: 1 } as const;
const NO_ROUTE = { kind: 'noRoute' } as const;

function state(over: Partial<RoutePanelState> = {}): RoutePanelState {
  return { chosenIndex: 0, hidden: false, ...over };
}

describe('routePanelKey', () => {
  it('варианты различаются, «без маршрута» стоит особняком', () => {
    expect(routePanelKey(FASTEST)).toBe('v0');
    expect(routePanelKey(OTHER)).toBe('v1');
    expect(routePanelKey(NO_ROUTE)).toBe('none');
  });
});

describe('isRoutePanelTargetActive — только подсветка', () => {
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
  it('первое нажатие после раскрытия всегда выбирает', () => {
    expect(routePanelAction(FASTEST, null)).toBe('choose');
    expect(routePanelAction(OTHER, null)).toBe('choose');
  });

  it('повторное нажатие на ту же кнопку сворачивает ряд', () => {
    expect(routePanelAction(OTHER, 'v1')).toBe('collapse');
    expect(routePanelAction(FASTEST, 'v0')).toBe('collapse');
  });

  it('переключение между путями ряд НЕ сворачивает, сколько бы раз ни жали', () => {
    // Ровно поломка 1.5.57: водитель сравнивал два пути, и на каком-то
    // нажатии меню закрывалось само.
    expect(routePanelAction(OTHER, 'v0')).toBe('choose');
    expect(routePanelAction(FASTEST, 'v1')).toBe('choose');
    expect(routePanelAction(OTHER, 'v0')).toBe('choose');
  });

  it('подсветка на решение не влияет', () => {
    // Активная кнопка меняется сама, когда развилка остаётся позади. Нажатие
    // на неё обязано выбирать, а не сворачивать: водитель ничего не нажимал.
    expect(routePanelAction(FASTEST, null)).toBe('choose');
    expect(routePanelAction(FASTEST, 'v1')).toBe('choose');
  });

  it('«Без маршрута» убирает линию, повторное нажатие сворачивает', () => {
    expect(routePanelAction(NO_ROUTE, null)).toBe('hide');
    expect(routePanelAction(NO_ROUTE, 'v0')).toBe('hide');
    expect(routePanelAction(NO_ROUTE, 'none')).toBe('collapse');
  });

  it('после «Без маршрута» нажатие на вариант возвращает линию', () => {
    // Иначе водитель, спрятавший маршрут, не смог бы вернуть его одним
    // нажатием: ряд схлопнулся бы, а линии так и не появилось.
    expect(routePanelAction(FASTEST, 'none')).toBe('choose');
    expect(routePanelAction(OTHER, 'none')).toBe('choose');
  });
});

describe('ROUTE_PANEL_AUTOHIDE_MS', () => {
  it('пятнадцать секунд — не мгновение и не вечность', () => {
    // Значение показывается водителю только поведением, поэтому зафиксировано
    // тестом: случайная правка на 1500 мс сделала бы панель неоткрываемой.
    expect(ROUTE_PANEL_AUTOHIDE_MS).toBe(15_000);
    expect(ROUTE_PANEL_AUTOHIDE_MS).toBeGreaterThanOrEqual(5_000);
  });
});
