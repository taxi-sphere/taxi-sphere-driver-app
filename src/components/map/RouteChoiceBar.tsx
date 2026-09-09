/**
 * @file: src/components/map/RouteChoiceBar.tsx
 * @description:
 *   Выбор варианта пути — панель над шторкой (MOB-024).
 *
 *   ЗАЧЕМ. Роутер отдаёт самый БЫСТРЫЙ путь; альтернатива нередко на 4-5 км
 *   короче при том же времени. Разница в километрах — это топливо водителя
 *   и, при нефиксированной цене, деньги клиента. До 1.5.49 выбора не было
 *   вовсе: приложение показывало то, что решил роутер.
 *
 *   ПОЧЕМУ ВНИЗУ, А НЕ СВЕРХУ. Верх карты занят рядом чипов («Итого»,
 *   ожидание), и он же — дорога впереди в режиме слежения. Низ карты у
 *   границы шторки — место, куда водитель и так смотрит, переводя взгляд с
 *   дороги на адрес.
 *
 *   ПАНЕЛЬ ПОКАЗЫВАЕТСЯ НЕ ВСЕГДА. Только когда пути расходятся ощутимо
 *   (`hasRealChoice`) и водитель ещё не выбрал. Предлагать выбор из двух
 *   почти одинаковых линий — отвлекать за рулём ради ничего.
 *
 * @dependencies: @/lib/theme, @/lib/route-choice, @/components/ui
 * @created: 2026-09-09 (1.5.49)
 */

import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/Text';
import { Surface } from '@/components/ui/Surface';
import { useTheme, useThemedStyles, type Theme } from '@/lib/theme';
import { radius, spacing } from '@/lib/design/tokens';
import type { RouteVariant } from '@/api/routing.api';

interface RouteChoiceBarProps {
  variants: RouteVariant[];
  /** Уже выбранный вариант — панель сворачивается в отметку со сбросом. */
  chosen: boolean;
  onChoose: (index: number) => void;
  /** Высота шторки: панель стоит НАД ней, а не под. */
  bottomInset: number;
}

/** «3.6 км · 6 мин» — то, чем варианты и отличаются. */
function variantLabel(variant: RouteVariant): string {
  const km = variant.distanceMeters != null ? variant.distanceMeters / 1000 : null;
  const min =
    variant.durationSeconds != null ? Math.round(variant.durationSeconds / 60) : null;
  const parts = [
    km != null ? `${km.toFixed(1)} км` : null,
    min != null ? `${min} мин` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'маршрут';
}

export function RouteChoiceBar({
  variants,
  chosen,
  onChoose,
  bottomInset,
}: RouteChoiceBarProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  /**
   * Порядок проверок важен: сначала «выбор сделан», и только потом «есть ли
   * из чего выбирать».
   *
   * После выбора маршрут строится ЧЕРЕЗ опорную точку, а роутер отдаёт
   * варианты только для запроса из двух координат — значит вариант приходит
   * ровно один. Проверь мы сначала их число, кнопка сброса исчезла бы сразу
   * после выбора, и отменить его было бы нечем (поймано на эмуляторе).
   */
  if (chosen) {
    return (
      <View style={[styles.wrap, { bottom: bottomInset + spacing.md }]}>
        <Pressable onPress={() => onChoose(0)} accessibilityRole="button">
          <Surface level={2} padded={false} radius={radius.pill} style={styles.reset}>
            <AppText variant="labelStrong" tone="muted">
              Свой маршрут · сбросить
            </AppText>
          </Surface>
        </Pressable>
      </View>
    );
  }

  if (variants.length < 2) return null;

  return (
    <View style={[styles.wrap, { bottom: bottomInset + spacing.md }]}>
      <View style={styles.row}>
        {variants.slice(0, 3).map((variant, index) => (
          <Pressable
            key={index}
            onPress={() => onChoose(index)}
            accessibilityRole="button"
            accessibilityLabel={`Вариант пути: ${variantLabel(variant)}`}
            style={({ pressed }) => [styles.item, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Surface level={2} padded={false} radius={radius.lg} style={styles.card}>
              {/* Первый вариант роутера — самый быстрый. Подпись нужна:
                  без неё два числа рядом не говорят, чем они отличаются. */}
              <AppText variant="caption" tone={index === 0 ? 'success' : 'muted'}>
                {index === 0 ? 'быстрее' : 'другой путь'}
              </AppText>
              <AppText variant="labelStrong" style={{ color: colors.textPrimary }}>
                {variantLabel(variant)}
              </AppText>
            </Surface>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: spacing.lg,
      right: spacing.lg,
      alignItems: 'center',
    },
    row: { flexDirection: 'row', gap: spacing.sm },
    item: { flexShrink: 1 },
    card: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      alignItems: 'center',
      gap: 2,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    reset: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 2,
    },
  });
