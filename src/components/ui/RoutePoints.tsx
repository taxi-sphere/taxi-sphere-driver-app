/**
 * @file: src/components/ui/RoutePoints.tsx
 * @description:
 *   Маршрут заказа: откуда, промежуточные остановки, куда — точками на
 *   вертикальной линии.
 *
 *   ЗАЧЕМ. Эта раскладка существовала в трёх копиях (карточка в списке
 *   заказов, экран текущего заказа, модалка входящего), и во всех трёх
 *   точки висели в воздухе без соединяющей линии, отчего порядок адресов
 *   читался не сразу. Здесь точки соединены — взгляд идёт сверху вниз, как
 *   и поездка.
 *
 *   Цвета точек — из палитры (`pointPickup` / `pointStop` / `pointDropoff`),
 *   а не зелёный-жёлтый-красный по месту.
 *
 * @dependencies: react-native, @/lib/theme
 * @created: 2026-09-01 (v1.5.17)
 */

import type { ReactNode } from 'react';
import { View, type ViewStyle, type StyleProp } from 'react-native';
import { spacing, useTheme } from '@/lib/theme';
import { AppText } from './Text';

export interface RoutePoint {
  address: string;
  /**
   * Подъезд — В СТРОКУ с адресом, тем же кеглем (1.5.33).
   *
   * До этого он склеивался с примечанием диспетчера в одну серую строку
   * через « · », и две разные вещи читались как одна. Подъезд — часть
   * адреса, примечание — то, что диспетчер сказал про эту точку.
   */
  entrance?: string | null;
  /** Примечание диспетчера к этой точке — отдельной строкой помельче. */
  note?: string | null;
  kind: 'pickup' | 'stop' | 'dropoff';
  /** Кнопка «Ехать» или что-то ещё, прижатое к правому краю строки. */
  action?: ReactNode;
  /**
   * Не адрес, а объяснение его отсутствия («Адрес назначения уточнит
   * клиент»). Пишется приглушённо, чтобы не читалось как настоящая точка.
   */
  muted?: boolean;
}

interface RoutePointsProps {
  points: RoutePoint[];
  /** Крупные адреса — для экрана активного заказа, где важна читаемость на ходу. */
  emphasized?: boolean;
  /** Обрезать адрес одной строкой — для плотного списка. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

const DOT = 12;

export function RoutePoints({
  points,
  emphasized = false,
  compact = false,
  style,
}: RoutePointsProps) {
  const { colors } = useTheme();

  const dotColor: Record<RoutePoint['kind'], string> = {
    pickup: colors.pointPickup,
    stop: colors.pointStop,
    dropoff: colors.pointDropoff,
  };

  return (
    <View style={style}>
      {points.map((point, index) => {
        const isLast = index === points.length - 1;

        return (
          <View key={`${point.kind}-${index}`} style={{ flexDirection: 'row', gap: spacing.md }}>
            {/* Колонка с точкой и линией до следующей точки */}
            <View style={{ alignItems: 'center', width: DOT }}>
              <View
                style={{
                  width: DOT,
                  height: DOT,
                  borderRadius: DOT / 2,
                  backgroundColor: dotColor[point.kind],
                  marginTop: emphasized ? 6 : 4,
                }}
              />
              {!isLast && (
                <View
                  style={{
                    flex: 1,
                    width: 2,
                    minHeight: spacing.md,
                    backgroundColor: colors.border,
                    marginVertical: spacing.xs,
                  }}
                />
              )}
            </View>

            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: spacing.sm,
                paddingBottom: isLast ? 0 : spacing.md,
              }}
            >
              <View style={{ flex: 1 }}>
                {/* Адрес и подъезд одной строкой, с переносом: не влез —
                    подъезд уходит вниз сам, а не давит адрес. */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-end',
                    flexWrap: 'wrap',
                    gap: spacing.sm,
                  }}
                >
                  <AppText
                    variant={emphasized ? 'subheading' : 'body'}
                    tone={point.muted ? 'muted' : 'primary'}
                    numberOfLines={compact ? 1 : undefined}
                    style={{ flexShrink: 1 }}
                  >
                    {point.address}
                  </AppText>
                  {point.entrance ? (
                    <AppText
                      variant={emphasized ? 'subheading' : 'body'}
                      weight="400"
                      tone="muted"
                    >
                      подъезд {point.entrance}
                    </AppText>
                  ) : null}
                </View>
                {point.note ? (
                  <AppText variant="label" tone="muted" style={{ marginTop: 2 }}>
                    {point.note}
                  </AppText>
                ) : null}
              </View>
              {point.action}
            </View>
          </View>
        );
      })}
    </View>
  );
}
