/**
 * @file: src/lib/route-panel.ts
 * @description:
 *   Что делает нажатие в панели выбора пути.
 *
 *   ЗАЧЕМ ОТДЕЛЬНО ОТ КОМПОНЕНТА. У панели три кнопки и три состояния
 *   (какой вариант ведёт, скрыта ли линия, раскрыт ли ряд), и одно и то же
 *   нажатие значит РАЗНОЕ: ткнуть в невыбранный вариант — выбрать его,
 *   ткнуть в выбранный — свернуть ряд. Правило простое, но проверить его
 *   глазами можно только за рулём, а тестовой библиотеки для компонентов в
 *   проекте нет — здесь принято выносить решение в чистую функцию и
 *   проверять её (`route-choice`, `map-follow`, `sheet-metrics`).
 *
 *   ПОЧЕМУ ПОВТОРНОЕ НАЖАТИЕ СВОРАЧИВАЕТ. Отдельный крестик — это четвёртая
 *   цель на панели, в которую водитель целится на ходу. А нажатие на уже
 *   выбранное — единственное, которому в этом ряду больше нечего было
 *   делать: выбирать заново нечего.
 *
 * @dependencies: нет (чистые функции)
 * @created: 2026-09-10 (1.5.57)
 */

/** Куда нажали: в один из вариантов пути или в «Без маршрута». */
export type RoutePanelTarget =
  | { kind: 'variant'; index: number }
  | { kind: 'noRoute' };

/** Что из этого следует. */
export type RoutePanelAction =
  /** Построить этот вариант, ряд оставить открытым — водитель сравнивает. */
  | 'choose'
  /** Убрать линию с карты. */
  | 'hide'
  /** Свернуть ряд, оставив всё как есть. */
  | 'collapse';

export interface RoutePanelState {
  /** Какой вариант ведёт сейчас; 0 — быстрый. */
  chosenIndex: number;
  /** Линия убрана с карты. */
  hidden: boolean;
}

/**
 * Активна ли кнопка — то есть описывает ли она то, что происходит сейчас.
 *
 * Скрытая линия «главнее» выбранного варианта: выбор при этом сохранён, но
 * на карте его не видно, и подсветить вариант значило бы соврать.
 */
export function isRoutePanelTargetActive(
  target: RoutePanelTarget,
  state: RoutePanelState,
): boolean {
  if (target.kind === 'noRoute') return state.hidden;
  return !state.hidden && target.index === state.chosenIndex;
}

/** Что сделать по нажатию. */
export function routePanelAction(
  target: RoutePanelTarget,
  state: RoutePanelState,
): RoutePanelAction {
  if (isRoutePanelTargetActive(target, state)) return 'collapse';
  return target.kind === 'noRoute' ? 'hide' : 'choose';
}
