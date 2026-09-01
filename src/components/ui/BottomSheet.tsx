/**
 * @file: src/components/ui/BottomSheet.tsx
 * @description:
 *   Шторка над содержимым экрана: свёрнута — видна только шапка,
 *   развёрнута — вся начинка. Тянется пальцем, открывается и по нажатию на
 *   полоску-ухват.
 *
 *   ЗАЧЕМ. Экран заказа был вертикальной простынёй из восьми карточек: чтобы
 *   увидеть адрес подачи, водителю приходилось скроллить. Шторка убирает
 *   скролл из главного сценария — всё нужное сразу видно, а подробности
 *   доступны одним движением и не мешают, пока не понадобятся.
 *
 *   ЗАЧЕМ ЖЕСТ НА RNGH, А НЕ НА `PanResponder`. Шторка лежит поверх карты,
 *   и `PanResponder` считает жест в JS-потоке — на кадре, где карта
 *   перерисовывается, палец уезжает вперёд шторки. Жест RNGH живёт в
 *   UI-потоке и от загрузки JS не зависит. Требует
 *   `GestureHandlerRootView` в корне — добавлен в `app/_layout.tsx`
 *   в v1.5.17, до этого его в приложении не было вовсе.
 *
 *   ГЛАВНОЕ ДЕЙСТВИЕ В ШТОРКУ НЕ КЛАДЁТСЯ. Кнопка «Я на месте» должна
 *   оставаться на одном месте в любом положении шторки: водитель жмёт её,
 *   не глядя. Её место — отдельная панель под шторкой.
 *
 * @dependencies: react-native-gesture-handler, react-native-reanimated, @/lib/theme
 * @created: 2026-09-01 (v1.5.17)
 */

import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { radius, spacing, useTheme } from '@/lib/theme';
import { spring } from '@/lib/design/motion';

interface BottomSheetProps {
  /** Всегда видимая часть. За неё же шторку и тянут. */
  header: ReactNode;
  /** Появляется при разворачивании. */
  children: ReactNode;
  /** Высота видимой части в свёрнутом состоянии (шапка + ухват). */
  collapsedHeight: number;
  /** Полная высота развёрнутой шторки. */
  expandedHeight: number;
  /** Отступ снизу — под панель главного действия. */
  bottomOffset?: number;
  onToggle?: (expanded: boolean) => void;
}

/** Скорость броска, после которой направление важнее пройденного пути. */
const FLICK_VELOCITY = 500;

export function BottomSheet({
  header,
  children,
  collapsedHeight,
  expandedHeight,
  bottomOffset = 0,
  onToggle,
}: BottomSheetProps) {
  const theme = useTheme();
  const range = Math.max(expandedHeight - collapsedHeight, 0);

  // Смещение вниз: 0 — развёрнута, `range` — свёрнута.
  const offset = useSharedValue(range);
  const startOffset = useSharedValue(range);

  const snapTo = (expanded: boolean) => {
    'worklet';
    offset.value = withSpring(expanded ? 0 : range, spring.gentle);
    if (onToggle) runOnJS(onToggle)(expanded);
  };

  const pan = Gesture.Pan()
    .onStart(() => {
      startOffset.value = offset.value;
    })
    .onUpdate((e) => {
      const next = startOffset.value + e.translationY;
      offset.value = Math.min(Math.max(next, 0), range);
    })
    .onEnd((e) => {
      // Быстрый бросок решает направление сам; медленное перетаскивание —
      // по тому, какую половину пути шторка прошла.
      const expanded =
        e.velocityY < -FLICK_VELOCITY
          ? true
          : e.velocityY > FLICK_VELOCITY
            ? false
            : offset.value < range / 2;
      snapTo(expanded);
    });

  const tap = Gesture.Tap().onEnd(() => {
    snapTo(offset.value > range / 2);
  });

  const gesture = Gesture.Race(pan, tap);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.sheet,
        theme.elevation[3],
        {
          bottom: bottomOffset,
          height: expandedHeight,
          borderTopLeftRadius: radius.xxl,
          borderTopRightRadius: radius.xxl,
        },
        sheetStyle,
      ]}
    >
      <GestureDetector gesture={gesture}>
        <View style={styles.headerZone}>
          <View style={[styles.grabber, { backgroundColor: theme.colors.borderStrong }]} />
          {header}
        </View>
      </GestureDetector>

      <View style={styles.body}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  headerZone: {
    paddingTop: spacing.sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: spacing.sm,
  },
  body: { flex: 1 },
});
