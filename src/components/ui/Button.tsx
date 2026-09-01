/**
 * @file: src/components/ui/Button.tsx
 * @description:
 *   Кнопка приложения: тема, размеры под палец, отклик на нажатие.
 *
 *   РАЗМЕРЫ ПОДНЯТЫ. Было 32/40/48/56 — нижние два меньше 48dp, которые
 *   Android считает минимальной зоной для пальца. Стало 40/48/56, и `sm`
 *   добирает недостающее через `hitSlop`: визуально компактная кнопка
 *   остаётся нажимаемой на ходу.
 *
 *   ОТКЛИК НА НАЖАТИЕ — не украшение. Водитель жмёт «Я на месте», не глядя
 *   на экран; подтверждение касания должно приходить раньше, чем ответ
 *   сервера, иначе кнопку жмут второй раз.
 *
 * @dependencies: react-native, react-native-reanimated, @expo/vector-icons, @/lib/theme
 * @created: 2026-01-24 12:00:00
 * @updated: 2026-09-01 (v1.5.17 — тема, токены, анимация нажатия)
 */

import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View, type ViewStyle, type StyleProp } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { icon as iconTokens, radius, spacing, text, touch, useTheme } from '@/lib/theme';
import { spring } from '@/lib/design/motion';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'danger'
  | 'outline'
  | 'ghost';

export type ButtonSize = 'sm' | 'md' | 'lg';

type IoniconName = keyof typeof Ionicons.glyphMap;

interface ButtonProps {
  children: ReactNode;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: IoniconName;
  iconPosition?: 'left' | 'right';
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

const SIZES: Record<ButtonSize, { height: number; padding: number; variant: 'label' | 'bodyStrong' | 'subheading'; icon: number }> = {
  sm: { height: 40, padding: spacing.md, variant: 'label', icon: iconTokens.sm },
  md: { height: touch.min, padding: spacing.lg, variant: 'bodyStrong', icon: iconTokens.md },
  lg: { height: touch.primary, padding: spacing.xl, variant: 'subheading', icon: iconTokens.lg },
};

/** Насколько кнопка «проседает» под пальцем. Едва заметно — это подтверждение, а не эффект. */
const PRESS_SCALE = 0.97;

export function Button({
  children,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  icon,
  iconPosition = 'left',
  style,
  accessibilityLabel,
}: ButtonProps) {
  const { colors } = useTheme();
  const s = SIZES[size];
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const fills: Record<ButtonVariant, string> = {
    primary: colors.primary,
    secondary: colors.surfaceSunken,
    success: colors.success,
    danger: colors.danger,
    outline: 'transparent',
    ghost: 'transparent',
  };
  const labels: Record<ButtonVariant, string> = {
    primary: colors.textInverse,
    secondary: colors.textPrimary,
    success: colors.textInverse,
    danger: colors.textInverse,
    outline: colors.primary,
    ghost: colors.textSecondary,
  };

  const isBlocked = disabled || loading;
  const background = disabled ? colors.surfaceSunken : fills[variant];
  const foreground = disabled ? colors.textMuted : labels[variant];

  return (
    <Animated.View style={[animStyle, fullWidth ? { width: '100%' } : null]}>
      <Pressable
        onPress={onPress}
        disabled={isBlocked}
        onPressIn={() => {
          scale.value = withSpring(PRESS_SCALE, spring.snappy);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, spring.snappy);
        }}
        // Компактная кнопка визуально мельче зоны нажатия — разницу добираем сюда.
        hitSlop={size === 'sm' ? spacing.xs : undefined}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled: isBlocked, busy: loading }}
        style={[
          {
            height: s.height,
            paddingHorizontal: s.padding,
            borderRadius: radius.md,
            backgroundColor: background,
            borderWidth: variant === 'outline' ? 1.5 : 0,
            borderColor: variant === 'outline' ? (disabled ? colors.border : colors.primary) : 'transparent',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.sm,
          },
          fullWidth ? { width: '100%' } : null,
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={foreground} />
        ) : (
          icon &&
          iconPosition === 'left' && <Ionicons name={icon} size={s.icon} color={foreground} />
        )}

        <Text style={[text[s.variant], { color: foreground }]} numberOfLines={1}>
          {children}
        </Text>

        {!loading && icon && iconPosition === 'right' && (
          <Ionicons name={icon} size={s.icon} color={foreground} />
        )}
      </Pressable>
    </Animated.View>
  );
}

interface IconButtonProps {
  icon: IoniconName;
  onPress: () => void;
  accessibilityLabel: string;
  /** Диаметр зоны нажатия. Меньше 48 не ставить без веской причины. */
  size?: number;
  color?: string;
  background?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Круглая кнопка с одной иконкой: позвонить, открыть навигатор, закрыть. */
export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  size = touch.min,
  color,
  background,
  disabled = false,
  style,
}: IconButtonProps) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        onPressIn={() => {
          scale.value = withSpring(PRESS_SCALE, spring.snappy);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, spring.snappy);
        }}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled }}
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: background ?? colors.surfaceSunken,
            opacity: disabled ? 0.5 : 1,
          },
          style,
        ]}
      >
        <View pointerEvents="none">
          <Ionicons name={icon} size={size * 0.45} color={color ?? colors.textPrimary} />
        </View>
      </Pressable>
    </Animated.View>
  );
}
