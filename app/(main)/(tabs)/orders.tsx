/**
 * @file: app/(main)/(tabs)/orders.tsx
 * @description:
 *   Экран доступных заказов: список заказов с pull-to-refresh.
 *   Статус-бар: Оффлайн / Занят / На линии.
 *   Заказы видны всегда (кроме оффлайн).
 * @dependencies: useAvailableOrders, useDriverStatus, useOrderActions
 * @created: 2026-03-12 18:00:00
 * @updated: 2026-03-16 14:00:00
 */

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAvailableOrders } from '@/hooks/useAvailableOrders';
import { useDriverStatus } from '@/hooks/useDriverStatus';
import { useOrderActions } from '@/hooks/useOrderActions';
import { useConnectionStore } from '@/stores/connection.store';
import { socketService } from '@/services/socket.service';
import { formatCurrency, formatDistance } from '@/lib/utils';
import { IncomingOrderModal } from '@/components/IncomingOrderModal';
import { getOrderEtaEstimate } from '@/api/orders.api';
import type { AvailableOrder } from '@/types/order';

const ACCEPT_TIMER_SEC = 30;
const DEFAULT_ETA_MIN = 5;

const RETRY_INTERVAL = 15; // секунд

export default function OrdersScreen() {
  const { status } = useDriverStatus();
  const { data: orders, isLoading, refetch, meta, error } = useAvailableOrders();
  const { accept } = useOrderActions();
  const socketStatus = useConnectionStore((s) => s.socketStatus);

  const isOnline = status === 'online' || status === 'busy' || status === 'on_order';
  const isDisconnected = socketStatus !== 'connected';

  // Таймер авто-переподключения
  const [retryCountdown, setRetryCountdown] = useState(RETRY_INTERVAL);
  const [isRetrying, setIsRetrying] = useState(false);
  const retryTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isDisconnected) {
      // Подключились — сброс таймера
      setRetryCountdown(RETRY_INTERVAL);
      if (retryTimer.current) {
        clearInterval(retryTimer.current);
        retryTimer.current = null;
      }
      return;
    }

    // Запуск обратного отсчёта
    setRetryCountdown(RETRY_INTERVAL);
    retryTimer.current = setInterval(() => {
      setRetryCountdown((prev) => {
        if (prev <= 1) {
          // Авто-retry
          handleRetry();
          return RETRY_INTERVAL;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (retryTimer.current) clearInterval(retryTimer.current);
    };
  }, [isDisconnected]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRetry = useCallback(() => {
    setIsRetrying(true);
    socketService.reconnect();
    setRetryCountdown(RETRY_INTERVAL);
    setTimeout(() => setIsRetrying(false), 2000);
  }, []);

  // Выбранный заказ для модалки подтверждения
  const [pendingOrder, setPendingOrder] = useState<AvailableOrder | null>(null);

  // Загрузка рекомендованного времени подачи от сервера
  const etaQuery = useQuery({
    queryKey: ['order', pendingOrder?.id, 'eta-estimate'],
    queryFn: () => getOrderEtaEstimate(pendingOrder!.id),
    enabled: !!pendingOrder,
    retry: 1,
    staleTime: 0,
    gcTime: 0,
  });

  const handleAccept = useCallback((order: AvailableOrder) => {
    setPendingOrder(order);
  }, []);

  const handleConfirmAccept = useCallback(
    (pickupEtaMin: number) => {
      if (!pendingOrder) return;
      accept.mutate(
        { orderId: pendingOrder.id, pickupEtaMin },
        { onSettled: () => setPendingOrder(null) },
      );
    },
    [accept, pendingOrder],
  );

  const handleDismissModal = useCallback(() => {
    if (accept.isPending) return;
    setPendingOrder(null);
  }, [accept.isPending]);

  const renderOrder = useCallback(({ item }: { item: AvailableOrder }) => (
    <OrderCard item={item} onAccept={handleAccept} />
  ), [handleAccept]);

  return (
    <View style={styles.container}>
      {/* Блок переподключения */}
      {isDisconnected && (
        <View style={styles.retryBlock}>
          <Text style={styles.retryTitle}>Нет подключения к серверу</Text>
          <Text style={styles.retryCountdown}>
            Повторное подключение через {retryCountdown}с
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, isRetrying && styles.retryButtonDisabled]}
            onPress={handleRetry}
            disabled={isRetrying}
            activeOpacity={0.7}
          >
            {isRetrying ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.retryButtonText}>Переподключиться</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* GPS предупреждение */}
      {!isDisconnected && meta && !meta.hasGps && (
        <View style={[
          styles.gpsBanner,
          meta.showOrdersWithoutGps ? styles.gpsBannerWarn : styles.gpsBannerError,
        ]}>
          <Text style={[
            styles.gpsBannerText,
            meta.showOrdersWithoutGps ? styles.gpsBannerTextWarn : styles.gpsBannerTextError,
          ]}>
            {meta.showOrdersWithoutGps
              ? 'GPS выключен — заказы показаны без фильтра расстояния'
              : 'Включите GPS для получения заказов'}
          </Text>
        </View>
      )}

      {/* Ошибка загрузки */}
      {error && !isDisconnected && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>Ошибка загрузки заказов</Text>
          <TouchableOpacity onPress={() => void refetch()} activeOpacity={0.7}>
            <Text style={styles.errorRetry}>Повторить</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Список заказов */}
      {isDisconnected ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Вы оффлайн</Text>
          <Text style={styles.emptySubtitle}>
            Ожидание подключения к серверу
          </Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          renderItem={renderOrder}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={() => void refetch()}
              tintColor="#4f46e5"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Нет доступных заказов</Text>
              <Text style={styles.emptySubtitle}>
                Новые заказы появятся автоматически
              </Text>
            </View>
          }
        />
      )}

      <IncomingOrderModal
        visible={!!pendingOrder}
        order={pendingOrder}
        mode="confirm"
        timerSec={ACCEPT_TIMER_SEC}
        initialEtaMin={etaQuery.data?.etaMin ?? DEFAULT_ETA_MIN}
        etaLoading={etaQuery.isFetching}
        accepting={accept.isPending}
        onAccept={handleConfirmAccept}
        onDismiss={handleDismissModal}
      />
    </View>
  );
}

/** Мемоизированная карточка заказа */
const OrderCard = memo(function OrderCard({
  item,
  onAccept,
}: {
  item: AvailableOrder;
  onAccept: (order: AvailableOrder) => void;
}) {
  return (
    <TouchableOpacity
      style={cardStyles.orderCard}
      onPress={() => onAccept(item)}
      activeOpacity={0.7}
    >
      <View style={cardStyles.orderHeader}>
        <Text style={cardStyles.orderNumber}>#{item.orderNumber}</Text>
        <Text style={cardStyles.orderPrice}>
          {formatCurrency(item.estimatedPrice)}
        </Text>
      </View>
      <View style={cardStyles.orderAddresses}>
        <View style={cardStyles.addressRow}>
          <View style={[cardStyles.dot, cardStyles.dotGreen]} />
          <Text style={cardStyles.addressText} numberOfLines={1}>
            {item.pickupAddress}
          </Text>
        </View>
        {(item.stops ?? []).map((stop, i) => (
          <View key={i} style={cardStyles.addressRow}>
            <View style={[cardStyles.dot, cardStyles.dotYellow]} />
            <Text style={cardStyles.addressTextStop} numberOfLines={1}>
              {stop.address}
            </Text>
          </View>
        ))}
        {item.dropoffAddress && (
          <View style={cardStyles.addressRow}>
            <View style={[cardStyles.dot, cardStyles.dotRed]} />
            <Text style={cardStyles.addressText} numberOfLines={1}>
              {item.dropoffAddress}
            </Text>
          </View>
        )}
      </View>
      <View style={cardStyles.orderFooter}>
        {item.distanceToPickup != null && (
          <Text style={cardStyles.orderMeta}>
            Подача: {formatDistance(item.distanceToPickup)}
          </Text>
        )}
        {item.estimatedKm != null && (
          <Text style={cardStyles.orderMeta}>
            Маршрут: {formatDistance(item.estimatedKm)}
          </Text>
        )}
        {item.tariffName && (
          <View style={cardStyles.tariffBadge}>
            <Text style={cardStyles.tariffText}>{item.tariffName}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});

const cardStyles = StyleSheet.create({
  orderCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    marginBottom: 8,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  orderNumber: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  orderPrice: { fontSize: 18, fontWeight: '700', color: '#111827' },
  orderAddresses: { gap: 4, marginBottom: 8 },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotGreen: { backgroundColor: '#22c55e' },
  dotYellow: { backgroundColor: '#f59e0b' },
  dotRed: { backgroundColor: '#ef4444' },
  addressText: { fontSize: 14, color: '#374151', flex: 1 },
  addressTextStop: { fontSize: 13, color: '#6b7280', flex: 1 },
  orderFooter: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  orderMeta: { fontSize: 12, color: '#9ca3af' },
  tariffBadge: {
    backgroundColor: '#ede9fe',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 'auto',
  },
  tariffText: { fontSize: 11, color: '#7c3aed', fontWeight: '600' },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  list: {
    padding: 12,
    gap: 8,
  },
  // Error banner
  errorBanner: {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorText: { fontSize: 13, color: '#991b1b', fontWeight: '500' },
  errorRetry: { fontSize: 13, color: '#4f46e5', fontWeight: '600' },

  // Retry block
  retryBlock: {
    backgroundColor: '#fef2f2',
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  retryTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#991b1b',
    marginBottom: 4,
  },
  retryCountdown: {
    fontSize: 13,
    color: '#b91c1c',
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: '#4f46e5',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 180,
    alignItems: 'center',
  },
  retryButtonDisabled: {
    opacity: 0.6,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },

  // GPS banner
  gpsBanner: {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
  },
  gpsBannerWarn: {
    backgroundColor: '#fefce8',
    borderColor: '#fde68a',
  },
  gpsBannerError: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  gpsBannerText: {
    fontSize: 13,
    fontWeight: '500' as const,
    textAlign: 'center' as const,
  },
  gpsBannerTextWarn: {
    color: '#92400e',
  },
  gpsBannerTextError: {
    color: '#991b1b',
  },

  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 8,
    textAlign: 'center',
  },
});
