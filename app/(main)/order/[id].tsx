/**
 * @file: app/(main)/order/[id].tsx
 * @description:
 *   Модальный экран деталей заказа (из списка доступных).
 *   Показывает подробности заказа и позволяет принять его.
 * @dependencies: useOrderActions, orders.api
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-12 18:00:00
 */

import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { getAvailableOrders, getOrderEtaEstimate } from '@/api/orders.api';
import { useOrderActions } from '@/hooks/useOrderActions';
import { IncomingOrderModal } from '@/components/IncomingOrderModal';
import { formatCurrency, formatDistance } from '@/lib/utils';

const ACCEPT_TIMER_SEC = 30;
const DEFAULT_ETA_MIN = 5;

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { accept } = useOrderActions();

  // Получаем заказ из кэша доступных заказов
  const { data: orders } = useQuery({
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

  const handleAccept = () => {
    if (!order) return;
    setConfirmOpen(true);
  };

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

  if (!order) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#4f46e5" />
          <Text style={styles.loadingText}>Загрузка заказа...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Шапка */}
        <View style={styles.header}>
          <Text style={styles.orderNumber}>#{order.orderNumber}</Text>
          <Text style={styles.price}>
            {formatCurrency(order.estimatedPrice)}
          </Text>
        </View>

        {/* Адреса */}
        <View style={styles.card}>
          <View style={styles.addressRow}>
            <View style={[styles.dot, styles.dotGreen]} />
            <View style={styles.addressContent}>
              <Text style={styles.addressLabel}>Откуда</Text>
              <Text style={styles.addressText}>{order.pickupAddress}</Text>
            </View>
          </View>
          {order.dropoffAddress && (
            <View style={styles.addressRow}>
              <View style={[styles.dot, styles.dotRed]} />
              <View style={styles.addressContent}>
                <Text style={styles.addressLabel}>Куда</Text>
                <Text style={styles.addressText}>{order.dropoffAddress}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Детали */}
        <View style={styles.card}>
          {order.estimatedKm != null && (
            <DetailRow
              label="Расстояние маршрута"
              value={formatDistance(order.estimatedKm)}
            />
          )}
          {order.distanceToPickup != null && (
            <DetailRow
              label="До точки подачи"
              value={formatDistance(order.distanceToPickup)}
            />
          )}
          {order.paymentMethod && (
            <DetailRow
              label="Оплата"
              value={
                order.paymentMethod === 'cash'
                  ? 'Наличные'
                  : order.paymentMethod === 'card'
                    ? 'Карта'
                    : 'Бонусы'
              }
            />
          )}
          {order.tariffName && (
            <DetailRow label="Тариф" value={order.tariffName} />
          )}
          {order.serviceName && (
            <DetailRow label="Служба" value={order.serviceName} />
          )}
          {order.stopsCount > 0 && (
            <DetailRow
              label="Остановки"
              value={String(order.stopsCount)}
            />
          )}
        </View>

        {/* Комментарий */}
        {order.comment && (
          <View style={styles.commentCard}>
            <Text style={styles.commentLabel}>Комментарий</Text>
            <Text style={styles.commentText}>{order.comment}</Text>
          </View>
        )}
      </ScrollView>

      {/* Кнопка принять */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.acceptButton}
          onPress={handleAccept}
          disabled={accept.isPending}
        >
          <Text style={styles.acceptButtonText}>
            {accept.isPending ? 'Принятие...' : 'ПРИНЯТЬ ЗАКАЗ'}
          </Text>
        </TouchableOpacity>
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
    </SafeAreaView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 100,
  },

  // Header
  header: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  orderNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  price: {
    fontSize: 32,
    fontWeight: '700',
    color: '#111827',
    marginTop: 4,
  },

  // Card
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },

  // Addresses
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  dotGreen: { backgroundColor: '#22c55e' },
  dotRed: { backgroundColor: '#ef4444' },
  addressContent: { flex: 1 },
  addressLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  addressText: {
    fontSize: 15,
    color: '#374151',
  },

  // Details
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 13,
    color: '#6b7280',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },

  // Comment
  commentCard: {
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  commentLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#92400e',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  commentText: {
    fontSize: 14,
    color: '#78350f',
  },

  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 32,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  acceptButton: {
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  acceptButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
});
