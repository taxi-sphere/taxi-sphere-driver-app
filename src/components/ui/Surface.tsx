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
 * @dependencies: react-native, @/lib/theme
 * @created: 2026-09-01 (v1.5.17)
 */

import type { ReactNode } from 'react';
import { View, type ViewStyle, type StyleProp } from 'react-native';
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

  return (
    <View style={[theme.elevation[level], { borderRadius: radius, padding }, style]}>
      {children}
    </View>
  );
}

/** Совместимость с прежним именем. Новый код пишите на `Surface`. */
export const Card = Surface;
