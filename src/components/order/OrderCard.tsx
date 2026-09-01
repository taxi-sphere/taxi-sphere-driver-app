/**
 * @file: src/components/order/OrderCard.tsx
 * @description:
 *   Карточка заказа в списке — и для свободных заказов, и для предзаказов.
 *
 *   ЧТО ИЗМЕНИЛОСЬ В v1.5.17.
 *   • Цена стала главным элементом карточки. Раньше она была той же
 *     величины, что номер заказа, — а водитель просматривает список именно
 *     по деньгам и расстоянию до подачи, номер ему не нужен вовсе.
 *   • Расстояние до подачи вынесено в отдельную строку со значком: прежде
 *     оно шло третьим в ряду одинаковых серых подписей и терялось.
 *   • Точки маршрута соединены линией (общий `RoutePoints`), а не висят
 *     тремя отдельными кружками — порядок адресов читается сразу.
 *   • Нажатие даёт отклик — и визуальный, и тактильный.
 *
 *   ОДИН КОМПОНЕНТ НА ДВА СПИСКА. Карточка предзаказа отличается от обычной
 *   только временем подачи; заводить ради этого вторую копию значило бы
 *   получить два разных вида одного и того же — ровно та беда, из-за
 *   которой экраны приложения разошлись между собой.
 *
 * @dependencies: @/components/ui, @/lib/theme, @/lib/utils
 * @created: 2026-09-01 (v1.5.17)
 */

import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency, formatDistance, formatScheduledAt } from '@/lib/utils';
import { icon as iconTokens, spacing, useTheme, useThemedStyles, type Theme } from '@/lib/theme';
import {
  AppText,
  Badge,
  Divider,
  RoutePoints,
  ScalePress,
  Surface,
  type RoutePoint,
} from '@/components/ui';
import type { AvailableOrder } from '@/types/order';

const PAYMENT_LABEL: Record<string, string> = {
  cash: 'Наличные',
  card: 'Карта',
  bonus: 'Бонусы',
};

interface OrderCardProps {
  order: AvailableOrder;
  onPress: (order: AvailableOrder) => void;
  /** Предзаказ показывает время подачи вместо расстояния до неё. */
  scheduled?: boolean;
}

export const OrderCard = memo(function OrderCard({
  order,
  onPress,
  scheduled = false,
}: OrderCardProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const points: RoutePoint[] = [
    { kind: 'pickup', address: order.pickupAddress },
    ...(order.stops ?? []).map((stop) => ({ kind: 'stop' as const, address: stop.address })),
    ...(order.dropoffAddress ? [{ kind: 'dropoff' as const, address: order.dropoffAddress }] : []),
  ];

  return (
    <ScalePress
      onPress={() => onPress(order)}
      accessibilityLabel={`Заказ номер ${order.orderNumber}, ${formatCurrency(order.estimatedPrice)}`}
    >
      <Surface level={1} style={styles.card}>
        <View style={styles.head}>
          <View style={styles.headLeft}>
            <AppText variant="caption" tone="muted" weight="700">
              № {order.orderNumber}
            </AppText>
            {scheduled && order.scheduledAt ? (
              <Badge tone="info" style={styles.timeBadge}>
                {formatScheduledAt(order.scheduledAt)}
              </Badge>
            ) : null}
          </View>
          <AppText variant="title" tone="success">
            {formatCurrency(order.estimatedPrice)}
          </AppText>
        </View>

        <RoutePoints points={points} compact style={styles.route} />

        <Divider style={styles.divider} />

        <View style={styles.footer}>
          {!scheduled && order.distanceToPickup != null && (
            <View style={styles.metric}>
              <Ionicons name="navigate-outline" size={iconTokens.xs} color={colors.primary} />
              <AppText variant="label" weight="700">
                {formatDistance(order.distanceToPickup)}
              </AppText>
              <AppText variant="label" tone="muted">
                до подачи
              </AppText>
            </View>
          )}

          {order.estimatedKm != null && (
            <View style={styles.metric}>
              <Ionicons name="git-branch-outline" size={iconTokens.xs} color={colors.textMuted} />
              <AppText variant="label" tone="secondary">
                {formatDistance(order.estimatedKm)}
              </AppText>
            </View>
          )}
        </View>

        {(order.tariffName || order.paymentMethod) && (
          <View style={styles.tags}>
            {order.tariffName ? <Badge tone="neutral">{order.tariffName}</Badge> : null}
            {order.paymentMethod ? (
              <Badge tone={order.paymentMethod === 'cash' ? 'success' : 'info'}>
                {PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod}
              </Badge>
            ) : null}
            {order.stopsCount > 0 ? (
              <Badge tone="warning">
                {order.stopsCount === 1 ? '1 остановка' : `${order.stopsCount} остановки`}
              </Badge>
            ) : null}
          </View>
        )}
      </Surface>
    </ScalePress>
  );
});

const createStyles = (_t: Theme) =>
  StyleSheet.create({
    card: { gap: spacing.md },
    head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    headLeft: { gap: spacing.xs, alignItems: 'flex-start' },
    timeBadge: { marginTop: 2 },
    route: { marginTop: spacing.xs },
    divider: { marginTop: spacing.xs },
    footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, flexWrap: 'wrap' },
    metric: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    tags: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  });
