/**
 * @file: src/components/ui/Segmented.tsx
 * @description:
 *   Переключатель между двумя-тремя списками одного экрана.
 *
 *   ЗАЧЕМ. «Предварительные» и «Встречные» были отдельными вкладками внизу
 *   и почти всегда пустовали — водитель платил за них двумя из четырёх
 *   мест в главной навигации. Здесь они становятся режимами того экрана,
 *   к которому и относятся, а нижние вкладки остаются под то, между чем
 *   водитель действительно переключается постоянно.
 *
 *   Бегунок под активным разделом едет, а не перепрыгивает: так видно,
 *   ЧТО именно переключилось, даже если взгляд был в стороне.
 *
 * @dependencies: react-native-reanimated, @/lib/theme, @/lib/haptics
 * @created: 2026-09-01 (v1.5.17)
 */

import { useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { haptics } from '@/lib/haptics';
import { radius, spacing, touch, useTheme, useThemedStyles, type Theme } from '@/lib/theme';
import { spring } from '@/lib/design/motion';
import { AppText } from './Text';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Число рядом с подписью: сколько заказов в разделе. */
  count?: number;
}

interface SegmentedProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [width, setWidth] = useState(0);

  const index = Math.max(
    options.findIndex((o) => o.value === value),
    0,
  );
  const segment = width > 0 ? width / options.length : 0;
  const offset = useSharedValue(0);

  useEffect(() => {
    offset.value = withSpring(index * segment, spring.snappy);
  }, [index, segment, offset]);

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View style={styles.track} onLayout={onLayout}>
      {segment > 0 && (
        <Animated.View style={[styles.thumb, { width: segment - 4 }, thumbStyle]} />
      )}

      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            style={styles.segment}
            onPress={() => {
              if (active) return;
              haptics.tap();
              onChange(option.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.label}
          >
            <AppText variant="label" weight={active ? '700' : '500'} tone={active ? 'primary' : 'muted'}>
              {option.label}
            </AppText>
            {option.count != null && option.count > 0 && (
              <View style={[styles.count, { backgroundColor: active ? colors.primary : colors.border }]}>
                <AppText
                  variant="caption"
                  weight="700"
                  style={{ color: active ? colors.textInverse : colors.textSecondary }}
                >
                  {option.count}
                </AppText>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    track: {
      flexDirection: 'row',
      backgroundColor: t.colors.surfaceSunken,
      borderRadius: radius.md,
      padding: 2,
      height: touch.min,
      alignItems: 'center',
    },
    // Бегунок лежит под подписями и едет за активным разделом.
    thumb: {
      position: 'absolute',
      left: 2,
      top: 2,
      bottom: 2,
      borderRadius: radius.sm + 2,
      backgroundColor: t.colors.surface,
      ...(t.isDark
        ? { borderWidth: 1, borderColor: t.colors.border }
        : {
            shadowColor: t.colors.shadow,
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.1,
            shadowRadius: 3,
            elevation: 2,
          }),
    },
    segment: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      height: '100%',
    },
    count: {
      minWidth: 20,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 5,
    },
  });
