/**
 * @file: src/components/ui/Skeleton.tsx
 * @description:
 *   Заглушки на время загрузки: мерцающий прямоугольник и готовые наборы
 *   под карточку заказа и экран заработка.
 *
 *   Цвет берётся из темы: прежняя заливка `#e5e7eb` в тёмной теме
 *   светилась ярче самого контента, который она изображала.
 *
 * @dependencies: react-native-reanimated, @/lib/theme
 * @created: 2026-01-24 12:00:00
 * @updated: 2026-09-01 (v1.5.17 — тема, токены)
 */

import { useEffect } from 'react';
import { View, type DimensionValue, type ViewStyle, type StyleProp } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { radius, spacing, useTheme } from '@/lib/theme';
import { easing } from '@/lib/design/motion';

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

/** Период полного цикла мерцания. Медленнее вдоха — быстрее раздражает. */
const PULSE_MS = 900;

export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius: r = radius.sm,
  style,
}: SkeletonProps) {
  const { colors } = useTheme();
  const opacity = useSharedValue(0.35);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.75, { duration: PULSE_MS, easing: easing.standard }),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: r, backgroundColor: colors.skeleton },
        animatedStyle,
        style,
      ]}
    />
  );
}

/** Заглушка карточки заказа — повторяет её реальную раскладку. */
export function OrderCardSkeleton() {
  const theme = useTheme();

  return (
    <View
      style={[
        theme.elevation[1],
        { borderRadius: radius.md, padding: spacing.lg, gap: spacing.md },
      ]}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Skeleton width={110} height={14} />
        <Skeleton width={70} height={22} borderRadius={radius.sm} />
      </View>
      <Skeleton width="82%" height={16} />
      <Skeleton width="62%" height={16} />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Skeleton width={80} height={14} />
        <Skeleton width={60} height={14} />
      </View>
    </View>
  );
}

/** Заглушка экрана заработка. */
export function EarningsSkeleton() {
  return (
    <View style={{ gap: spacing.md }}>
      <Skeleton height={110} borderRadius={radius.lg} />
      <Skeleton height={64} borderRadius={radius.md} />
      <Skeleton height={44} borderRadius={radius.sm} />
      <Skeleton height={44} borderRadius={radius.sm} />
      <Skeleton height={44} borderRadius={radius.sm} />
    </View>
  );
}
