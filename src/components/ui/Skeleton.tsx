import React, { useEffect } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius = 8,
  style,
}: SkeletonProps) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.7, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: width as number,
          height,
          borderRadius,
          backgroundColor: '#e5e7eb',
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

/** Скелетон карточки заказа */
export function OrderCardSkeleton() {
  return (
    <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 10, borderWidth: 1, borderColor: '#f0f0f0' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Skeleton width={100} height={12} />
        <Skeleton width={60} height={20} borderRadius={10} />
      </View>
      <Skeleton width="80%" height={14} />
      <Skeleton width="60%" height={14} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Skeleton width={70} height={12} />
        <Skeleton width={50} height={12} />
        <Skeleton width={80} height={12} />
      </View>
    </View>
  );
}

/** Скелетон экрана заработка */
export function EarningsSkeleton() {
  return (
    <View style={{ gap: 12 }}>
      <Skeleton height={100} borderRadius={12} />
      <Skeleton height={60} borderRadius={12} />
      <Skeleton height={40} borderRadius={8} />
      <Skeleton height={40} borderRadius={8} />
      <Skeleton height={40} borderRadius={8} />
    </View>
  );
}
