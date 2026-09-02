/**
 * @file: src/components/ui/Surface.tsx
 * @description:
 *   Карточка или панель с глубиной по теме.
 *
 *   Уровень (`level`) — это не «насколько сильная тень», а «насколько
 *   высоко лежит блок»: в светлой теме глубина рисуется тенью, в тёмной —
 *   более светлой поверхностью и обводкой, потому что чёрная тень на
 *   тёмном фоне не видна. Решение принимает палитра, а не вызывающий код.
 *
 *   ОБРЕЗКА И ГЛУБИНА — ВСЕГДА НА РАЗНЫХ ВЬЮХАХ. Почему именно так —
 *   в комментарии к `clipsChildren` ниже.
 *
 * @dependencies: react-native, @/lib/theme
 * @created: 2026-09-01 (v1.5.17)
 * @updated: 2026-09-02 (v1.5.23 — обрезка отделена от глубины)
 */

import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle, type StyleProp } from 'react-native';
import { radius as radiusTokens, spacing, useTheme, type ElevationLevel } from '@/lib/theme';

interface SurfaceProps {
  children: ReactNode;
  /** 0 — вровень с фоном, 1 — карточка, 2 — всплывающая панель, 3 — шторка. */
  level?: ElevationLevel;
  /** Внутренние отступы. `false` — свои. */
  padded?: boolean | number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Surface({
  children,
  level = 1,
  padded = true,
  radius = radiusTokens.md,
  style,
}: SurfaceProps) {
  const theme = useTheme();
  const padding = padded === true ? spacing.lg : padded === false ? 0 : padded;

  // Обрезку содержимого уносим на отдельную вьюху — см. `clipsChildren`.
  const clips = clipsChildren(style);
  const base = [theme.elevation[level], { borderRadius: radius }, style];

  if (!clips) {
    return <View style={[base, { padding }]}>{children}</View>;
  }

  return (
    <View style={[base, styles.noClip]}>
      <View style={[styles.clip, { borderRadius: radius, padding }]}>{children}</View>
    </View>
  );
}

/**
 * Просил ли вызывающий обрезать содержимое по скруглению.
 *
 * ЗАЧЕМ ЭТО ВООБЩЕ. `overflow: 'hidden'` и андроидный `elevation` на ОДНОЙ
 * вьюхе несовместимы, если `elevation` появляется у уже отрисованной вьюхи:
 * Android пересчитывает контур отсечения и вырезает всех детей. Высота
 * блока остаётся (разметка посчиталась), а рисовать в нём нечего.
 *
 * Ловится это ровно на смене темы. В тёмной палитре глубина уровня 1 — это
 * обводка, `elevation` там нет; в светлой — есть. Переключение «тёмная →
 * светлая» на ОТКРЫТОМ экране добавляет `elevation` живой вьюхе, и все
 * карточки становятся пустыми белыми прямоугольниками. Обратное
 * переключение и открытие экрана заново работают — потому и жило незамеченным
 * (v1.5.22, экран настроек).
 *
 * Поэтому обрезка и глубина здесь всегда на разных вьюхах: внешняя несёт
 * фон и тень, внутренняя — скругление и `overflow`.
 */
function clipsChildren(style: StyleProp<ViewStyle>): boolean {
  if (!style) return false;
  return StyleSheet.flatten(style)?.overflow === 'hidden';
}

const styles = StyleSheet.create({
  /** Перебивает `overflow: 'hidden'` вызывающего: обрезает внутренняя вьюха. */
  noClip: { overflow: 'visible' },
  clip: { overflow: 'hidden' },
});

/** Совместимость с прежним именем. Новый код пишите на `Surface`. */
export const Card = Surface;
