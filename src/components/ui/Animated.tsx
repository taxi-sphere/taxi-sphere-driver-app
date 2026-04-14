/**
 * Анимационные обёртки на Reanimated:
 * - FadeIn — плавное появление
 * - SlideUp — появление снизу
 * - PulseButton — пульсирующая кнопка
 * - ScalePress — уменьшение при нажатии
 */

import React, { useEffect } from 'react';
import { TouchableOpacity, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withSpring,
  withDelay,
  Easing,
  FadeIn as RFadeIn,
  FadeInDown,
  FadeInUp,
  SlideInDown,
  SlideInUp,
  Layout,
} from 'react-native-reanimated';

// Re-export entering animations for direct use
export { RFadeIn as ReanimatedFadeIn, FadeInDown, FadeInUp, SlideInDown, SlideInUp, Layout };

/** Плавное появление с задержкой */
export function FadeIn({
  children,
  delay = 0,
  duration = 300,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  style?: ViewStyle;
}) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(8);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.ease) }));
    translateY.value = withDelay(delay, withTiming(0, { duration, easing: Easing.out(Easing.ease) }));
  }, [delay, duration, opacity, translateY]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[animStyle, style]}>
      {children}
    </Animated.View>
  );
}

/** Появление снизу */
export function SlideUp({
  children,
  delay = 0,
  duration = 400,
  distance = 30,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  distance?: number;
  style?: ViewStyle;
}) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(distance);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration }));
    translateY.value = withDelay(delay, withSpring(0, { damping: 15, stiffness: 120 }));
  }, [delay, distance, duration, opacity, translateY]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[animStyle, style]}>
      {children}
    </Animated.View>
  );
}

/** Пульсирующая кнопка — привлекает внимание */
export function PulseButton({
  children,
  onPress,
  disabled = false,
  style,
  pulseColor = 'rgba(79, 70, 229, 0.3)',
}: {
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
  pulseColor?: string;
}) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (disabled) {
      scale.value = withTiming(1);
      return;
    }
    scale.value = withRepeat(
      withSequence(
        withTiming(1.03, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
  }, [disabled, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animStyle}>
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.8}
        style={style}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

/** Уменьшение при нажатии */
export function ScalePress({
  children,
  onPress,
  disabled = false,
  style,
}: {
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.95, { damping: 15, stiffness: 200 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 200 });
  };

  return (
    <Animated.View style={animStyle}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        activeOpacity={1}
        style={style}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

/** Stagger — последовательное появление элементов списка */
export function StaggerItem({
  children,
  index,
  style,
}: {
  children: React.ReactNode;
  index: number;
  style?: ViewStyle;
}) {
  return (
    <FadeIn delay={index * 80} style={style}>
      {children}
    </FadeIn>
  );
}
