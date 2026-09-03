/**
 * @file: src/components/order/OrderProgress.tsx
 * @description:
 *   Полоса этапов заказа: Подача → Жду → Поездка → Готово.
 *
 *   ЗАЧЕМ. До v1.5.17 текущий этап показывался одним бейджем в углу
 *   («Назначен», «В пути»). По нему нельзя было понять ни что уже сделано,
 *   ни что будет дальше, — а водитель принимает следующее действие именно
 *   исходя из этого. Полоса отвечает на оба вопроса одним взглядом и
 *   заодно объясняет, почему кнопка внизу называется именно так.
 *
 *   Заполнение анимировано: переход между этапами — единственное, что
 *   меняется на экране после нажатия главной кнопки, и он должен быть
 *   заметен, иначе водитель жмёт второй раз.
 *
 * @dependencies: react-native-reanimated, @/lib/theme, @/components/ui
 * @created: 2026-09-01 (v1.5.17)
 * @updated: 2026-09-03 (1.5.31 — полоса делит строку с кнопками, подписи в одну строку)
 */

import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { spacing, useTheme, useThemedStyles, type Theme } from '@/lib/theme';
import { timing } from '@/lib/design/motion';
import { AppText } from '@/components/ui';
import type { OrderStatus } from '@/types/order';

/**
 * Этапы в порядке прохождения. Отменённый заказ полосы не показывает.
 *
 * «Жду» вместо «Ожидание» (1.5.31) — ВЫНУЖДЕННО, и вот почему. Полоса
 * делит строку с кнопками звонка и навигатора, а значит каждому этапу
 * достаётся четверть от 236 точек — около 59. «Ожидание» шрифтом 12
 * занимает 65 и переносилось на вторую строку (видно на снимке проверки
 * 1.5.31). Шрифт мельче 12 в проекте запрещён, кнопки мельче 36 — тоже
 * предел. Слово «Жду» короче, а для водителя, который ждёт клиента у
 * подъезда, ещё и точнее: остальные подписи экрана тоже от первого лица
 * («Я НА МЕСТЕ»).
 */
const STEPS = [
  { key: 'assigned', label: 'Подача' },
  { key: 'driver_arrived', label: 'Жду' },
  { key: 'in_progress', label: 'Поездка' },
  { key: 'completed', label: 'Готово' },
] as const;

const DOT = 22;

export function OrderProgress({ status }: { status: OrderStatus }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const currentIndex = STEPS.findIndex((s) => s.key === status);
  // Неизвестный статус (new / searching / canceled) — считаем, что заказ
  // ещё в самом начале, полосу не заполняем.
  const active = currentIndex < 0 ? 0 : currentIndex;

  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = withTiming(active / (STEPS.length - 1), timing.slow);
  }, [active, fill]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  return (
    <View style={styles.wrap}>
      {/* Линия под точками: сначала серая на всю ширину, поверх — заполнение */}
      <View style={styles.track}>
        <Animated.View style={[styles.trackFill, fillStyle]} />
      </View>

      <View style={styles.row}>
        {STEPS.map((step, index) => {
          const done = index < active;
          const isCurrent = index === active;
          const background = done
            ? colors.success
            : isCurrent
              ? colors.primary
              : colors.surfaceSunken;

          return (
            <View key={step.key} style={styles.step}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: background, borderColor: colors.surface },
                ]}
              >
                {done ? (
                  <Ionicons name="checkmark" size={13} color={colors.textInverse} />
                ) : (
                  <View
                    style={[
                      styles.innerDot,
                      { backgroundColor: isCurrent ? colors.textInverse : colors.textMuted },
                    ]}
                  />
                )}
              </View>
              {/* В одну строку ВСЕГДА: на узком экране подпись обрежется
                  многоточием, но не развалит полосу на два ряда. */}
              <AppText
                variant="caption"
                numberOfLines={1}
                tone={isCurrent ? 'brand' : done ? 'success' : 'muted'}
                weight={isCurrent ? '700' : '500'}
              >
                {step.label}
              </AppText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    /**
     * Без собственных боковых отступов (1.5.31).
     *
     * Полоса делит строку с кнопками звонка и навигатора, и каждая точка
     * ширины идёт подписям: самое длинное слово шкалы («Поездка») занимает
     * около 57 из 59 доступных, а шрифт мельче 12 в этом проекте запрещён
     * (см. `text` в tokens.ts). Отступ, если он нужен, задаёт родитель — он
     * один знает, что стоит рядом.
     */
    wrap: { paddingHorizontal: 0 },
    // Линия проходит по центру ряда точек: сверху её перекрывают сами точки.
    //
    // Отступы В ПРОЦЕНТАХ, а не в пикселях: шаг между центрами точек равен
    // ширине ряда, делённой на число этапов, поэтому центр первой точки
    // стоит на 1/8 ширины (при четырёх этапах), а не на фиксированных 24px.
    // С пиксельным отступом линия торчала бы за крайние точки на узких
    // экранах и не доходила до них на широких.
    track: {
      position: 'absolute',
      left: '12.5%',
      right: '12.5%',
      top: DOT / 2 - 1,
      height: 2,
      backgroundColor: t.colors.border,
      borderRadius: 1,
    },
    trackFill: {
      height: 2,
      backgroundColor: t.colors.success,
      borderRadius: 1,
    },
    row: { flexDirection: 'row', justifyContent: 'space-between' },
    step: { alignItems: 'center', gap: spacing.xs, flex: 1 },
    dot: {
      width: DOT,
      height: DOT,
      borderRadius: DOT / 2,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 3,
    },
    innerDot: { width: 6, height: 6, borderRadius: 3 },
  });
