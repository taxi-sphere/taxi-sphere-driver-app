/**
 * @file: src/components/ui/Animated.tsx
 * @description:
 *   Анимационные обёртки: появление, каскад по списку, отклик на нажатие,
 *   привлечение внимания.
 *
 *   Все длительности и пружины берутся из `@/lib/design/motion`. До
 *   v1.5.17 здесь стояли 300, 400, 600, 800 мс, подобранные по месту, —
 *   такой разнобой глазом читается не как «разные числа», а как общая
 *   небрежность интерфейса.
 *
 * @dependencies: react-native-reanimated, @/lib/design/motion, @/lib/theme
 * @created: 2026-01-24 12:00:00
 * @updated: 2026-09-01 (v1.5.17 — токены движения)
 */

import React, { useEffect } from 'react';
import { Pressable, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withSpring,
  withDelay,
  FadeIn as RFadeIn,
  FadeInDown,
  FadeInUp,
  SlideInDown,
  SlideInUp,
  LinearTransition,
} from 'react-native-reanimated';
import { motion } from '@/lib/design/tokens';
import { spring, staggerDelay, timing } from '@/lib/design/motion';

export {
  RFadeIn as ReanimatedFadeIn,
  FadeInDown,
  FadeInUp,
  SlideInDown,
  SlideInUp,
  LinearTransition,
};

/** Насколько элемент «проседает» под пальцем. */
const PRESS_SCALE = 0.96;

/** Плавное появление с лёгким подъёмом снизу. */
export function FadeIn({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(8);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, timing.enter));
    translateY.value = withDelay(delay, withTiming(0, timing.enter));
  }, [delay, opacity, translateY]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={[animStyle, style]}>{children}</Animated.View>;
}

/** Появление снизу — для панелей и шторок. */
export function SlideUp({
  children,
  delay = 0,
  distance = 28,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  distance?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(distance);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, timing.enter));
    translateY.value = withDelay(delay, withSpring(0, spring.gentle));
  }, [delay, opacity, translateY]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={[animStyle, style]}>{children}</Animated.View>;
}

/**
 * Пульсация — привлекает внимание к одному элементу.
 *
 * Пользоваться экономно: если пульсирует два элемента, не привлекает
 * внимания ни один.
 */
export function PulseButton({
  children,
  onPress,
  disabled = false,
  style,
}: {
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (disabled) {
      scale.value = withTiming(1, timing.fast);
      return;
    }
    scale.value = withRepeat(
      withSequence(
        withTiming(1.03, { duration: motion.duration.deliberate }),
        withTiming(1, { duration: motion.duration.deliberate }),
      ),
      -1,
      true,
    );
  }, [disabled, scale]);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={animStyle}>
      <Pressable onPress={onPress} disabled={disabled} style={style}>
        {children}
      </Pressable>
    </Animated.View>
  );
}

/** Нажимаемая обёртка с откликом. Для карточек и строк списка. */
export function ScalePress({
  children,
  onPress,
  disabled = false,
  style,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    /**
     * СТИЛЬ ИДЁТ НА ВНЕШНЮЮ ВЬЮХУ, А НЕ НА `Pressable`.
     *
     * Флекс-ребёнком родительской строки является именно эта обёртка. Когда
     * `style` вешали на `Pressable` внутри, раскладочные свойства применялись
     * на уровень глубже, чем надо, и схлопывались: `flex: 1` внутри
     * контейнера без собственной высоты — это `flexBasis: 0` и нулевая
     * высота. В 1.5.26 так пропал переключатель «Текущий / Встречный» на
     * экране заказа: две цветные полоски по 16 точек, текст срезан целиком,
     * ширины неравные (замерено: 115 и 138 вместо 160). Водитель видел
     * элемент, но не мог прочитать, что это.
     *
     * `Pressable` внутри растянут на всю обёртку — иначе нажималась бы
     * только область под содержимым.
     */
    <Animated.View style={[style, animStyle]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          scale.value = withSpring(PRESS_SCALE, spring.snappy);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, spring.snappy);
        }}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={styles.fill}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flexGrow: 1 },
});

/**
 * Элемент списка с каскадной задержкой появления.
 *
 * Задержка ограничена сверху (`staggerDelay`): иначе в длинном списке
 * нижние карточки выезжали бы через полторы секунды после верхних.
 */
export function StaggerItem({
  children,
  index,
  style,
}: {
  children: React.ReactNode;
  index: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <FadeIn delay={staggerDelay(index)} style={style}>
      {children}
    </FadeIn>
  );
}
