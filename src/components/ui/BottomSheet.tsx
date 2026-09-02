/**
 * @file: src/components/ui/BottomSheet.tsx
 * @description:
 *   Шторка над содержимым экрана: свёрнута — видна только шапка,
 *   развёрнута — вся начинка. Тянется пальцем за шапку, сворачивается и
 *   разворачивается нажатием на полоску-ухват.
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
 *   НАЖАТИЕ ТОЛЬКО НА УХВАТЕ, а не на всей шапке. В шапке живут кнопки
 *   («Позвонить», «Навигатор», переключатель заказов), и жест Tap на всём
 *   блоке срабатывал бы вместе с ними: водитель звонит клиенту — и шторка
 *   заодно складывается. Протягивание (Pan) на всей шапке безопасно: оно
 *   требует движения и обычному нажатию не мешает.
 *
 *   ГЛАВНОЕ ДЕЙСТВИЕ В ШТОРКУ НЕ КЛАДЁТСЯ. Кнопка «Я на месте» должна
 *   оставаться на одном месте в любом положении шторки: водитель жмёт её,
 *   не глядя. Её место — отдельная панель под шторкой.
 *
 * @dependencies: react-native-gesture-handler, react-native-reanimated, @/lib/theme
 * @created: 2026-09-01 (v1.5.17)
 */

import { useCallback, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
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

  /** Довести шторку до ближайшего положения. Годится и из JS, и из worklet. */
  const snapTo = useCallback(
    (expanded: boolean) => {
      'worklet';
      offset.value = withSpring(expanded ? 0 : range, spring.gentle);
      if (onToggle) {
        // Из worklet колбэк вызывается только через runOnJS; из JS-потока
        // тот же вызов работает напрямую.
        runOnJS(onToggle)(expanded);
      }
    },
    [offset, range, onToggle],
  );

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
      {/* Обрезка живёт на отдельной вьюхе, а не на самой шторке: `elevation`
          и `overflow: 'hidden'` на одной вьюхе Android не прощает — при смене
          темы он вырезает всё содержимое (подробности — в Surface.tsx). */}
      <View
        style={[
          styles.clip,
          { borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl },
        ]}
      >
        <GestureDetector gesture={pan}>
          <View style={styles.headerZone}>
            <Pressable
              onPress={() => snapTo(offset.value > range / 2)}
              hitSlop={spacing.md}
              accessibilityRole="button"
              accessibilityLabel="Развернуть или свернуть подробности заказа"
              style={styles.grabberHit}
            >
              <View style={[styles.grabber, { backgroundColor: theme.colors.borderStrong }]} />
            </Pressable>
            {header}
          </View>
        </GestureDetector>

        <View style={styles.body}>{children}</View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  /** Скругление верхних углов режет содержимое здесь, а не на самой шторке. */
  clip: { flex: 1, overflow: 'hidden' },
  headerZone: {
    paddingTop: spacing.xs,
  },
  // Полоска тонкая, а нажимать по ней надо пальцем — зона крупнее самой полоски.
  grabberHit: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xxl,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  body: { flex: 1 },
});
