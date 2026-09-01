/**
 * @file: app/(main)/order/[id].tsx
 * @description:
 *   Модальный экран деталей заказа (из списка доступных).
 *   Показывает подробности заказа и позволяет принять его.
 *
 *   v1.5.17: переведён на дизайн-систему. Раньше это был третий по счёту
 *   способ нарисовать одно и то же — свои точки маршрута, своя карточка,
 *   своя кнопка «ПРИНЯТЬ ЗАКАЗ» зелёного цвета, которого нет больше нигде.
 *   Теперь маршрут рисует общий `RoutePoints`, а кнопка выглядит как все
 *   главные кнопки приложения.
 *
 * @dependencies: useOrderActions, orders.api, @/components/ui
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-09-01 (v1.5.17 — дизайн-система)
 */

import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { getAvailableOrders, getOrderEtaEstimate } from '@/api/orders.api';
import { useOrderActions } from '@/hooks/useOrderActions';
import { IncomingOrderModal } from '@/components/IncomingOrderModal';
import { formatCurrency, formatDistance } from '@/lib/utils';
import { spacing, touch, useTheme, useThemedStyles, type Theme } from '@/lib/theme';
import {
  AppText,
  Badge,
  Button,
  EmptyState,
  RoutePoints,
  Screen,
  Surface,
  type RoutePoint,
} from '@/components/ui';

const ACCEPT_TIMER_SEC = 30;
const DEFAULT_ETA_MIN = 5;

const PAYMENT_LABEL: Record<string, string> = {
  cash: 'Наличные',
  card: 'Карта',
  bonus: 'Бонусы',
};

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { accept } = useOrderActions();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  // Получаем заказ из кэша доступных заказов
  const { data: orders, isLoading } = useQuery({
    queryKey: ['orders', 'available'],
    queryFn: () => getAvailableOrders(),
    staleTime: 10_000,
  });

  const order = orders?.items.find((o) => o.id === id);

  const [confirmOpen, setConfirmOpen] = useState(false);

  const etaQuery = useQuery({
    queryKey: ['order', order?.id, 'eta-estimate'],
    queryFn: () => getOrderEtaEstimate(order!.id),
    enabled: confirmOpen && !!order,
    retry: 1,
    staleTime: 0,
    gcTime: 0,
  });

  const handleConfirmAccept = (pickupEtaMin: number) => {
    if (!order) return;
    accept.mutate(
      { orderId: order.id, pickupEtaMin },
      {
        onSuccess: () => router.back(),
        onSettled: () => setConfirmOpen(false),
      },
    );
  };

  const handleDismissModal = () => {
    if (accept.isPending) return;
    setConfirmOpen(false);
  };

  if (isLoading && !order) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <AppText variant="label" tone="muted" style={styles.loadingText}>
          Загружаю заказ…
        </AppText>
      </Screen>
    );
  }

  if (!order) {
    // Заказ мог уйти другому водителю, пока экран открывался.
    return (
      <Screen>
        <EmptyState
          icon="close-circle-outline"
          title="Заказ уже забрали"
          description="Его принял другой водитель или диспетчер отменил заказ"
          action={{ label: 'К списку', onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const points: RoutePoint[] = [
    { kind: 'pickup', address: order.pickupAddress },
    ...(order.stops ?? []).map((stop) => ({ kind: 'stop' as const, address: stop.address })),
    ...(order.dropoffAddress ? [{ kind: 'dropoff' as const, address: order.dropoffAddress }] : []),
  ];

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <AppText variant="label" tone="muted">
            № {order.orderNumber}
          </AppText>
          <AppText variant="display" tone="success">
            {formatCurrency(order.estimatedPrice)}
          </AppText>
        </View>

        <Surface level={1}>
          <RoutePoints points={points} emphasized />
        </Surface>

        <Surface level={1} padded={false} style={styles.details}>
          {order.estimatedKm != null && (
            <DetailRow label="Расстояние маршрута" value={formatDistance(order.estimatedKm)} />
          )}
          {order.distanceToPickup != null && (
            <DetailRow label="До точки подачи" value={formatDistance(order.distanceToPickup)} />
          )}
          {order.paymentMethod && (
            <DetailRow
              label="Оплата"
              value={PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod}
            />
          )}
          {order.tariffName && <DetailRow label="Тариф" value={order.tariffName} />}
          {order.serviceName && <DetailRow label="Служба" value={order.serviceName} />}
          {order.stopsCount > 0 && (
            <DetailRow label="Остановки" value={String(order.stopsCount)} />
          )}
        </Surface>

        {order.comment ? (
          <Surface level={0} style={[styles.comment, { backgroundColor: colors.warningSoft }]}>
            <Badge tone="warning">Комментарий</Badge>
            <AppText variant="body" style={styles.commentText}>
              {order.comment}
            </AppText>
          </Surface>
        ) : null}
      </ScrollView>

      <View style={[styles.bottomBar, { backgroundColor: colors.surface }]}>
        <Button
          onPress={() => setConfirmOpen(true)}
          size="lg"
          fullWidth
          loading={accept.isPending}
        >
          ПРИНЯТЬ ЗАКАЗ
        </Button>
      </View>

      <IncomingOrderModal
        visible={confirmOpen}
        order={order}
        mode="confirm"
        timerSec={ACCEPT_TIMER_SEC}
        initialEtaMin={etaQuery.data?.etaMin ?? DEFAULT_ETA_MIN}
        etaLoading={etaQuery.isFetching}
        accepting={accept.isPending}
        onAccept={handleConfirmAccept}
        onDismiss={handleDismissModal}
      />
    </Screen>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.detailRow}>
      <AppText variant="body" tone="muted">
        {label}
      </AppText>
      <AppText variant="bodyStrong">{value}</AppText>
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    centered: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
    loadingText: { marginTop: spacing.xs },
    // Нижний отступ — под неподвижную панель с кнопкой.
    content: {
      padding: spacing.lg,
      gap: spacing.md,
      paddingBottom: touch.primary + spacing.xxxl * 2,
    },
    header: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm },
    details: { paddingHorizontal: spacing.lg },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: t.colors.border,
    },
    comment: { gap: spacing.sm },
    commentText: { marginTop: spacing.xs },
    bottomBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      padding: spacing.lg,
      paddingBottom: spacing.xxl,
      borderTopWidth: 1,
      borderTopColor: t.colors.border,
    },
  });
