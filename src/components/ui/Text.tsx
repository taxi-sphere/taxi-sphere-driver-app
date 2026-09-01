/**
 * @file: src/components/ui/Text.tsx
 * @description:
 *   Текст с готовым размером и цветом из дизайн-системы.
 *
 *   ЗАЧЕМ. В приложении встречались размеры 10, 11, 12, 13, 14, 15, 16, 18,
 *   20, 22, 24, 32 — большая часть подобрана на глаз в отдельно взятом
 *   экране. Здесь их семь, и все с явным межстрочным интервалом.
 *
 *   Свой `style` по-прежнему можно передать — он ложится поверх варианта,
 *   так что частный случай не требует нового варианта.
 *
 * @dependencies: react-native, @/lib/theme
 * @created: 2026-09-01 (v1.5.17)
 */

import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { text, useTheme, type ThemeColors } from '@/lib/theme';
import type { TextVariant } from '@/lib/design/tokens';

/** Смысловой цвет текста — не название краски, а роль. */
export type TextTone =
  | 'primary'
  | 'secondary'
  | 'muted'
  | 'inverse'
  | 'brand'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

const TONE_TO_COLOR: Record<TextTone, keyof ThemeColors> = {
  primary: 'textPrimary',
  secondary: 'textSecondary',
  muted: 'textMuted',
  inverse: 'textInverse',
  brand: 'primary',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  info: 'info',
};

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  tone?: TextTone;
  /** Переопределяет насыщенность варианта, не меняя размер. */
  weight?: TextStyle['fontWeight'];
  center?: boolean;
}

export function AppText({
  variant = 'body',
  tone = 'primary',
  weight,
  center = false,
  style,
  ...rest
}: AppTextProps) {
  const { colors } = useTheme();

  return (
    <RNText
      {...rest}
      style={[
        text[variant] as TextStyle,
        { color: colors[TONE_TO_COLOR[tone]] },
        weight ? { fontWeight: weight } : null,
        center ? { textAlign: 'center' } : null,
        style,
      ]}
    />
  );
}
