/**
 * @file: src/lib/design/motion.ts
 * @description:
 *   Готовые кривые и конфигурации анимации, собранные из токенов.
 *
 *   Отдельным модулем от `./tokens`, потому что тянет Reanimated: токены
 *   должны импортироваться в тестах без нативного окружения, а этот файл —
 *   только в компонентах.
 *
 *   ПОЛЬЗОВАТЬСЯ ОТСЮДА, а не писать `withTiming(x, { duration: 300 })` по
 *   месту. Разнобой в длительностях глазом не читается как «разные числа» —
 *   он читается как небрежность интерфейса в целом.
 *
 * @dependencies: react-native-reanimated, ./tokens
 * @created: 2026-09-01 (v1.5.17)
 */

import { Easing, type WithSpringConfig, type WithTimingConfig } from 'react-native-reanimated';
import { MAX_STAGGER_ITEMS, motion } from './tokens';

export const easing = {
  /** Основная кривая: быстрый старт, мягкая остановка. */
  standard: Easing.bezier(...motion.curve.standard),
  /** Для появления элемента. */
  decelerate: Easing.bezier(...motion.curve.decelerate),
  /** Для ухода элемента с экрана. */
  accelerate: Easing.bezier(...motion.curve.accelerate),
} as const;

export const timing = {
  instant: { duration: motion.duration.instant, easing: easing.standard },
  fast: { duration: motion.duration.fast, easing: easing.standard },
  normal: { duration: motion.duration.normal, easing: easing.standard },
  slow: { duration: motion.duration.slow, easing: easing.standard },
  deliberate: { duration: motion.duration.deliberate, easing: easing.standard },
  /** Появление: тормозит к концу, поэтому воспринимается «прилетевшим». */
  enter: { duration: motion.duration.normal, easing: easing.decelerate },
  /** Уход: разгоняется, поэтому не задерживает взгляд. */
  exit: { duration: motion.duration.fast, easing: easing.accelerate },
} satisfies Record<string, WithTimingConfig>;

export const spring = {
  gentle: motion.spring.gentle,
  snappy: motion.spring.snappy,
  bouncy: motion.spring.bouncy,
} satisfies Record<string, WithSpringConfig>;

/**
 * Задержка появления i-го элемента списка.
 *
 * Ограничена сверху (см. `MAX_STAGGER_ITEMS`): без потолка тридцатый заказ
 * в списке выезжал бы через полторы секунды после первого — красиво один
 * раз и невыносимо в работе.
 */
export function staggerDelay(index: number): number {
  return Math.min(index, MAX_STAGGER_ITEMS) * motion.stagger;
}
