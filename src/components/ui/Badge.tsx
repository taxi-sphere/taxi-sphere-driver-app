/**
 * @file: src/components/ui/Badge.tsx
 * @description:
 *   Бейдж статуса.
 *
 *   ПО УМОЛЧАНИЮ ТЕПЕРЬ МЯГКИЙ — цветной текст на бледной подложке, а не
 *   белый на сплошной заливке. Заливок на экране заказа набиралось до пяти
 *   разом (статус, тариф, оплата, подъезд, расстояние), и они спорили и
 *   между собой, и с кнопкой действия. Сплошная заливка осталась под
 *   `solid` — для одного акцента, который действительно должен кричать.
 *
 *   Размер текста поднят с 10px до 12px: десять на бейдже статуса за рулём
 *   не читается.
 *
 * @dependencies: react-native, @/lib/theme
 * @created: 2026-01-24 12:00:00
 * @updated: 2026-09-01 (v1.5.17 — тема, мягкий вариант, крупнее текст)
 */

import type { ReactNode } from 'react';
import { View, Text, type ViewStyle, type StyleProp } from 'react-native';
import { radius, spacing, text, useTheme, type ThemeColors } from '@/lib/theme';

export type BadgeTone = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  /** Сплошная заливка вместо мягкой подложки. Только для главного акцента. */
  solid?: boolean;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}

const TONES: Record<BadgeTone, { fg: keyof ThemeColors; bg: keyof ThemeColors }> = {
  brand: { fg: 'primary', bg: 'primarySoft' },
  success: { fg: 'success', bg: 'successSoft' },
  warning: { fg: 'warning', bg: 'warningSoft' },
  danger: { fg: 'danger', bg: 'dangerSoft' },
  info: { fg: 'info', bg: 'infoSoft' },
  neutral: { fg: 'textSecondary', bg: 'surfaceSunken' },
};

export function Badge({ children, tone = 'brand', solid = false, size = 'sm', style }: BadgeProps) {
  const { colors } = useTheme();
  const t = TONES[tone];

  const background = solid ? colors[t.fg] : colors[t.bg];
  const foreground = solid ? colors.textInverse : colors[t.fg];

  return (
    <View
      style={[
        {
          alignSelf: 'flex-start',
          borderRadius: radius.pill,
          backgroundColor: background,
          paddingHorizontal: size === 'sm' ? spacing.sm : spacing.md,
          paddingVertical: size === 'sm' ? 3 : spacing.xs + 1,
        },
        style,
      ]}
    >
      <Text
        style={[
          size === 'sm' ? text.caption : text.label,
          { color: foreground, fontWeight: '700' },
        ]}
      >
        {children}
      </Text>
    </View>
  );
}
