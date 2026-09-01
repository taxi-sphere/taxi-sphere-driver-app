/**
 * @file: src/components/earnings/EarningsChart.tsx
 * @description:
 *   Столбчатый график заработка по дням.
 *
 *   ИСПРАВЛЕНО В v1.5.17 — ГЛАВНОЕ. График рисовался по `Math.random()`:
 *   в проде водителю показывали выдуманные цифры собственного заработка.
 *   Теперь он строится по разбивке `daily`, которую отдаёт сервер, а если
 *   сервер её ещё не отдаёт — график не показывается вовсе. Пустое место
 *   честнее вымысла, тем более про деньги.
 *
 *   Столбцы вырастают снизу при появлении: это единственная анимация на
 *   экране «Деньги», и она уместна ровно потому, что показывает рост.
 *
 * @dependencies: react-native-reanimated, @/lib/theme, @/components/ui
 * @created: 2026-01-24 12:00:00
 * @updated: 2026-09-01 (v1.5.17 — реальные данные вместо Math.random)
 */

import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { formatCurrency } from '@/lib/utils';
import { radius, spacing, useTheme, useThemedStyles, type Theme } from '@/lib/theme';
import { motion } from '@/lib/design/tokens';
import { timing } from '@/lib/design/motion';
import { AppText, Surface } from '@/components/ui';
import type { DailyEarnings } from '@/types/earnings';

interface EarningsChartProps {
  data: DailyEarnings[];
  title?: string;
}

const CHART_HEIGHT = 120;
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

export function EarningsChart({ data, title }: EarningsChartProps) {
  const styles = useThemedStyles(createStyles);

  if (data.length === 0) return null;

  const max = Math.max(...data.map((d) => d.amount), 1);
  const total = data.reduce((sum, d) => sum + d.amount, 0);
  const todayKey = toDateKey(new Date());

  return (
    <Surface level={1} style={styles.card}>
      <View style={styles.head}>
        <AppText variant="overline" tone="muted">
          {title ?? 'По дням'}
        </AppText>
        <AppText variant="bodyStrong">{formatCurrency(total)}</AppText>
      </View>

      <View style={styles.bars}>
        {data.map((day, index) => (
          <Bar
            key={day.date}
            day={day}
            index={index}
            ratio={day.amount / max}
            isToday={day.date.slice(0, 10) === todayKey}
          />
        ))}
      </View>
    </Surface>
  );
}

function Bar({
  day,
  index,
  ratio,
  isToday,
}: {
  day: DailyEarnings;
  index: number;
  ratio: number;
  isToday: boolean;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const grow = useSharedValue(0);

  useEffect(() => {
    grow.value = withDelay(index * motion.stagger, withTiming(ratio, timing.slow));
  }, [ratio, index, grow]);

  const fillStyle = useAnimatedStyle(() => ({
    // Минимум 3% — иначе день без заработка выглядит как отсутствующий
    // столбец, и шкала «провисает».
    height: `${Math.max(grow.value * 100, 3)}%`,
  }));

  return (
    <View style={styles.column}>
      <AppText variant="caption" tone={day.amount > 0 ? 'secondary' : 'muted'} numberOfLines={1}>
        {day.amount > 0 ? Math.round(day.amount) : ''}
      </AppText>

      <View style={styles.track}>
        <Animated.View
          style={[
            styles.fill,
            fillStyle,
            {
              backgroundColor:
                day.amount === 0
                  ? colors.border
                  : isToday
                    ? colors.primary
                    : colors.primarySoft,
            },
          ]}
        />
      </View>

      <AppText variant="caption" tone={isToday ? 'brand' : 'muted'} weight={isToday ? '700' : '500'}>
        {weekdayLabel(day.date)}
      </AppText>
    </View>
  );
}

/** Локальный день в формате YYYY-MM-DD — без сдвига часового пояса. */
function toDateKey(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function weekdayLabel(dateKey: string): string {
  const parsed = new Date(`${dateKey.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return '';
  return WEEKDAYS[parsed.getDay()] ?? '';
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    card: { gap: spacing.md },
    head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    bars: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs },
    column: { flex: 1, alignItems: 'center', gap: spacing.xs },
    track: {
      width: '100%',
      height: CHART_HEIGHT,
      justifyContent: 'flex-end',
      backgroundColor: t.colors.surfaceSunken,
      borderRadius: radius.sm,
      overflow: 'hidden',
    },
    fill: { width: '100%', borderRadius: radius.sm },
  });
