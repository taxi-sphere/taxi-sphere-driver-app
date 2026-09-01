/**
 * @file: src/components/ui/Gradient.tsx
 * @description:
 *   Градиентная подложка.
 *
 *   ЗАЧЕМ. Плоская однотонная заливка на крупных блоках — шапке меню,
 *   карточке баланса, главной кнопке — выдаёт быструю сборку. Мягкий
 *   переход по диагонали стоит одного элемента, а на глаз отличает
 *   «сделано» от «набросано».
 *
 *   ПОЧЕМУ НА `react-native-svg`, А НЕ НА `expo-linear-gradient`.
 *   Нативный модуль поставить не удалось — `npm install` падает с EPERM на
 *   `node_modules` (системная блокировка, не песочница). `react-native-svg`
 *   уже стоит в проекте и умеет ровно то же самое, без пересборки.
 *
 *   ИДЕНТИФИКАТОР ГРАДИЕНТА УНИКАЛЕН НА ЭКЗЕМПЛЯР (`useId`). В SVG
 *   заливка адресуется по id: два блока с одинаковым id получат один и тот
 *   же градиент, и второй молча перекрасится в цвета первого.
 *
 * @dependencies: react-native-svg, @/lib/theme
 * @created: 2026-09-01 (v1.5.17)
 */

import { useId, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '@/lib/theme';

/** Направление перехода. Диагональ выглядит естественнее вертикали. */
export type GradientDirection = 'diagonal' | 'vertical' | 'horizontal';

const VECTORS: Record<GradientDirection, { x1: string; y1: string; x2: string; y2: string }> = {
  diagonal: { x1: '0', y1: '0', x2: '1', y2: '1' },
  vertical: { x1: '0', y1: '0', x2: '0', y2: '1' },
  horizontal: { x1: '0', y1: '0', x2: '1', y2: '0' },
};

interface GradientProps {
  children?: ReactNode;
  /** Два цвета перехода. Не заданы — берётся бренд-градиент темы. */
  colors?: [string, string];
  direction?: GradientDirection;
  /** Скругление: применяется к обёртке, поэтому обрезает и градиент. */
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Gradient({
  children,
  colors,
  direction = 'diagonal',
  radius = 0,
  style,
}: GradientProps) {
  const theme = useTheme();
  // `useId()` отдаёт строку вида «:r0:». Двоеточия в идентификаторе SVG,
  // на который потом ссылаются через `url(#…)`, — источник тихой поломки:
  // градиент просто не находится и блок остаётся прозрачным. Оставляем
  // только буквы и цифры, уникальность от этого не страдает.
  const id = `grad${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [from, to] = colors ?? [theme.colors.primary, theme.colors.primaryDark];
  const v = VECTORS[direction];

  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden' }, style]}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1={v.x1} y1={v.y1} x2={v.x2} y2={v.y2}>
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
      {children}
    </View>
  );
}
